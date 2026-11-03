import 'dart:async';
import 'dart:convert';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../models/event_model.dart';
import '../models/group_model.dart';
import '../models/user_model.dart';
import 'api_service.dart';
import 'notification_service.dart';

class SigapProvider extends ChangeNotifier {
  static const String _prefTokenKey = 'sigap_jwt_token';
  static const String _prefUserKey = 'sigap_user_json';
  static const String _prefBackendUrlKey = 'sigap_backend_url';
  static const String _prefSyncedDefaultUrlKey = 'sigap_synced_default_url';

  final ApiService api = ApiService();
  final AudioPlayer _audioPlayer = AudioPlayer();

  bool _initializing = true;
  bool _loading = false;
  UserModel? _user;
  List<FamilyGroupModel> _groups = [];
  FamilyGroupModel? _activeGroup;
  List<FallEventModel> _events = [];
  final Set<int> _unlockedGroupIds = <int>{};

  // Interkom 2 arah: suara masuk terbaru dari Mikrofon POV CCTV (Laptop)
  Map<String, dynamic>? _latestCctvVoice;
  int _unreadCctvVoiceCount = 0;
  bool _isPlayingVoice = false;
  String? _playingVoiceUrl;
  int _lastHandledCctvVoiceId = 0;
  bool _voiceBaselineInitialized = false;
  Timer? _voicePollTimer;

  String _statusFilter = '';
  String? _dateFrom;
  String? _dateTo;

  WebSocketChannel? _wsChannel;
  StreamSubscription? _wsSub;
  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<PlayerState>? _playerStateSub;
  Timer? _wsReconnectTimer;
  int? _wsGroupId;

  bool get isInitializing => _initializing;
  bool get isLoading => _loading;
  bool get isAuthenticated => _user != null && api.token != null;
  UserModel? get user => _user;
  List<FamilyGroupModel> get groups => _groups;
  FamilyGroupModel? get activeGroup => _activeGroup;
  List<FallEventModel> get events => _events;
  String get statusFilter => _statusFilter;
  String? get dateFrom => _dateFrom;
  String? get dateTo => _dateTo;
  String get backendUrl => api.baseUrl;
  bool get isCurrentGroupLocked =>
      _activeGroup != null && !_unlockedGroupIds.contains(_activeGroup!.id);
  bool get isCurrentGroupOwner =>
      _activeGroup != null && _user != null && _activeGroup!.adminId == _user!.id;

  Map<String, dynamic>? get latestCctvVoice => _latestCctvVoice;
  int get unreadCctvVoiceCount => _unreadCctvVoiceCount;
  bool get isPlayingVoice => _isPlayingVoice;
  String? get playingVoiceUrl => _playingVoiceUrl;

  FallEventModel? get latestUnhandledEvent {
    for (final ev in _events) {
      if (ev.isUnhandled) return ev;
    }
    return null;
  }

  Future<void> init() async {
    try {
      await _audioPlayer.setReleaseMode(ReleaseMode.stop);
      await _audioPlayer.setVolume(1.0);
    } catch (_) {}

    _playerStateSub = _audioPlayer.onPlayerStateChanged.listen((state) {
      final playing = state == PlayerState.playing;
      if (_isPlayingVoice != playing) {
        _isPlayingVoice = playing;
        if (!playing) _playingVoiceUrl = null;
        notifyListeners();
      }
    });

    const dartDefineUrl = String.fromEnvironment('BACKEND_URL');
    final prefs = await SharedPreferences.getInstance();
    final savedUrl = prefs.getString(_prefBackendUrlKey);
    final prevSyncedDefault = prefs.getString(_prefSyncedDefaultUrlKey);

    if (dartDefineUrl.isNotEmpty) {
      api.setBaseUrl(dartDefineUrl);
      await prefs.setString(_prefBackendUrlKey, api.baseUrl);
      await prefs.setString(_prefSyncedDefaultUrlKey, api.baseUrl);
    } else if (prevSyncedDefault != ApiService.defaultBackendUrl) {
      api.setBaseUrl(ApiService.defaultBackendUrl);
      await prefs.setString(_prefBackendUrlKey, api.baseUrl);
      await prefs.setString(_prefSyncedDefaultUrlKey, ApiService.defaultBackendUrl);
    } else if (savedUrl != null && savedUrl.isNotEmpty) {
      api.setBaseUrl(savedUrl);
    }

    final savedToken = prefs.getString(_prefTokenKey);
    final savedUserJson = prefs.getString(_prefUserKey);
    if (savedToken != null && savedUserJson != null) {
      try {
        api.setToken(savedToken);
        _user = UserModel.fromJson(
          Map<String, dynamic>.from(jsonDecode(savedUserJson) as Map),
        );
        await _syncFcmToken();
        await refreshGroupsAndEvents();
      } catch (_) {
        await logout();
      }
    }

    _initializing = false;
    notifyListeners();
  }

  Future<void> playVoiceUrl(String rawUrlOrPath) async {
    final resolved = api.resolveMediaUrl(rawUrlOrPath);
    if (resolved.isEmpty) return;
    try {
      await _audioPlayer.stop();
      await _audioPlayer.setVolume(1.0);
      _playingVoiceUrl = resolved;
      _isPlayingVoice = true;
      notifyListeners();

      try {
        final localFile = await api.downloadVoiceToTempFile(resolved);
        await _audioPlayer.play(DeviceFileSource(localFile.path));
      } catch (_) {
        await _audioPlayer.play(UrlSource(resolved));
      }
    } catch (_) {
      _isPlayingVoice = false;
      _playingVoiceUrl = null;
      notifyListeners();
    }
  }

  void _handleIncomingCctvVoice(Map<String, dynamic> data) {
    final voiceId = (data['id'] as num?)?.toInt() ?? 0;
    if (voiceId > 0 && voiceId <= _lastHandledCctvVoiceId) {
      return;
    }
    if (voiceId > 0) {
      _lastHandledCctvVoiceId = voiceId;
    }
    _voiceBaselineInitialized = true;

    final fileOrUrl =
        (data['file_path'] ?? data['url'] ?? '').toString().trim();
    final resolvedUrl = api.resolveMediaUrl(fileOrUrl);
    final enriched = <String, dynamic>{
      ...data,
      'url': resolvedUrl,
    };

    _latestCctvVoice = enriched;
    _unreadCctvVoiceCount += 1;
    notifyListeners();

    final camId = (data['camera_id'] as num?)?.toInt() ?? 1;
    final camName = data['camera_name']?.toString() ?? 'Ruangan';
    final lansia = data['nama_lansia']?.toString() ??
        _activeGroup?.namaLansia ??
        'Lansia';

    NotificationService.instance.showCctvVoiceNotification(
      cameraId: camId,
      title: 'Suara dari CCTV $camName',
      body: '$lansia berbicara melalui mikrofon ruangan.',
    );
    if (resolvedUrl.isNotEmpty) {
      playVoiceUrl(resolvedUrl);
    }
  }

  void _startVoicePolling() {
    _voicePollTimer?.cancel();
    _voicePollTimer = Timer.periodic(
      const Duration(milliseconds: 2500),
      (_) => _pollRecentCctvVoices(),
    );
    _pollRecentCctvVoices();
  }

  Future<void> _pollRecentCctvVoices() async {
    final grp = _activeGroup;
    if (!isAuthenticated || grp == null || grp.cameras.isEmpty) return;

    for (final cam in grp.cameras) {
      try {
        final items = await api.getCameraVoices(cameraId: cam.id);
        final cctvItems = items
            .where((it) => it['direction']?.toString() == 'cctv_to_family')
            .toList();
        if (cctvItems.isEmpty) continue;

        final newest = cctvItems.first;
        final newestId = (newest['id'] as num?)?.toInt() ?? 0;

        if (!_voiceBaselineInitialized) {
          if (newestId > _lastHandledCctvVoiceId) {
            _lastHandledCctvVoiceId = newestId;
          }
          if (_latestCctvVoice == null) {
            final fileOrUrl =
                (newest['file_path'] ?? newest['url'] ?? '').toString();
            _latestCctvVoice = <String, dynamic>{
              ...newest,
              'url': api.resolveMediaUrl(fileOrUrl),
            };
            notifyListeners();
          }
          continue;
        }

        if (newestId > _lastHandledCctvVoiceId) {
          _handleIncomingCctvVoice(newest);
        }
      } catch (_) {}
    }
    _voiceBaselineInitialized = true;
  }

  Future<void> stopVoicePlayback() async {
    try {
      await _audioPlayer.stop();
    } catch (_) {}
    _isPlayingVoice = false;
    _playingVoiceUrl = null;
    notifyListeners();
  }

  void markCctvVoiceRead() {
    if (_unreadCctvVoiceCount > 0) {
      _unreadCctvVoiceCount = 0;
      notifyListeners();
    }
  }

  Future<void> updateBackendUrl(String newUrl) async {
    api.setBaseUrl(newUrl);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefBackendUrlKey, api.baseUrl);
    notifyListeners();
    if (isAuthenticated && _activeGroup != null) {
      _connectGroupWebSocket(_activeGroup!.id);
    }
  }

  Future<void> _syncFcmToken() async {
    final fcmToken = await NotificationService.instance.getFcmToken();
    if (fcmToken != null && fcmToken.isNotEmpty) {
      try {
        await api.saveFcmToken(fcmToken);
      } catch (_) {}
    }

    await _tokenRefreshSub?.cancel();
    final stream = NotificationService.instance.onTokenRefresh;
    if (stream != null) {
      _tokenRefreshSub = stream.listen((newToken) async {
        try {
          await api.saveFcmToken(newToken);
        } catch (_) {}
      });
    }
  }

  Future<void> login(String email, String password) async {
    _loading = true;
    notifyListeners();
    try {
      final result = await api.login(email: email, password: password);
      await _persistAuth(result.token, result.user);
      await _syncFcmToken();
      await refreshGroupsAndEvents();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> register(String nama, String email, String password) async {
    _loading = true;
    notifyListeners();
    try {
      final result = await api.register(
        nama: nama,
        email: email,
        password: password,
      );
      await _persistAuth(result.token, result.user);
      await _syncFcmToken();
      await refreshGroupsAndEvents();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> _persistAuth(String token, UserModel userModel) async {
    _user = userModel;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefTokenKey, token);
    await prefs.setString(_prefUserKey, jsonEncode(userModel.toJson()));
  }

  Future<void> logout() async {
    _disconnectWebSocket();
    await stopVoicePlayback();
    await _tokenRefreshSub?.cancel();
    api.setToken(null);
    _user = null;
    _groups = [];
    _activeGroup = null;
    _events = [];
    _latestCctvVoice = null;
    _unreadCctvVoiceCount = 0;
    _unlockedGroupIds.clear();

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_prefTokenKey);
    await prefs.remove(_prefUserKey);
    notifyListeners();
  }

  Future<void> refreshGroupsAndEvents() async {
    if (!isAuthenticated) return;
    _groups = await api.getGroups();
    if (_groups.isNotEmpty) {
      final currentId = _activeGroup?.id;
      final selected = _groups.firstWhere(
        (g) => g.id == currentId,
        orElse: () => _groups.first,
      );
      _activeGroup = await api.getGroupDetail(selected.id);
      await loadEvents();
      _connectGroupWebSocket(_activeGroup!.id);
    } else {
      _activeGroup = null;
      _events = [];
      _disconnectWebSocket();
    }
    notifyListeners();
  }

  Future<void> selectGroup(int groupId) async {
    _activeGroup = await api.getGroupDetail(groupId);
    _latestCctvVoice = null;
    _unreadCctvVoiceCount = 0;
    await loadEvents();
    _connectGroupWebSocket(groupId);
    notifyListeners();
  }

  Future<void> joinGroupByCode(String code) async {
    _loading = true;
    notifyListeners();
    try {
      final joined = await api.joinGroup(code);
      _unlockedGroupIds.add(joined.id);
      await refreshGroupsAndEvents();
      await selectGroup(joined.id);
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<FamilyGroupModel> createFamilyGroup({
    required String namaGrup,
    required String namaLansia,
    required String kontakDarurat,
    String? kodeUndangan,
    String? namaRuanganAwal,
  }) async {
    _loading = true;
    notifyListeners();
    try {
      final created = await api.createGroup(
        namaGrup: namaGrup,
        namaLansia: namaLansia,
        kontakDarurat: kontakDarurat,
        kodeUndangan: kodeUndangan,
        namaRuanganAwal: namaRuanganAwal,
      );
      _unlockedGroupIds.add(created.id);
      await refreshGroupsAndEvents();
      await selectGroup(created.id);
      return created;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> unlockCurrentGroupWithCode(String code) async {
    if (_activeGroup == null) return;
    _loading = true;
    notifyListeners();
    try {
      final ok = await api.verifyFamilyCode(
        groupId: _activeGroup!.id,
        kodeUndangan: code,
      );
      if (ok) {
        _unlockedGroupIds.add(_activeGroup!.id);
      }
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  void lockCurrentGroup() {
    if (_activeGroup == null) return;
    _unlockedGroupIds.remove(_activeGroup!.id);
    notifyListeners();
  }

  Future<void> updateFamilyGroup({
    String? namaGrup,
    String? namaLansia,
    String? kontakDarurat,
    String? kodeUndangan,
  }) async {
    if (_activeGroup == null) return;
    _loading = true;
    notifyListeners();
    try {
      final updated = await api.updateGroup(
        groupId: _activeGroup!.id,
        namaGrup: namaGrup,
        namaLansia: namaLansia,
        kontakDarurat: kontakDarurat,
        kodeUndangan: kodeUndangan,
      );
      _activeGroup = updated;
      _groups = _groups.map((g) => g.id == updated.id ? updated : g).toList();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> addRoomCamera(
    String namaRuangan, {
    String lokasiCctv = '',
  }) async {
    if (_activeGroup == null) return;
    _loading = true;
    notifyListeners();
    try {
      await api.addCamera(
        groupId: _activeGroup!.id,
        namaRuangan: namaRuangan,
        lokasiCctv: lokasiCctv,
      );
      _activeGroup = await api.getGroupDetail(_activeGroup!.id);
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> updateRoomCamera({
    required int cameraId,
    String? namaRuangan,
    String? lokasiCctv,
  }) async {
    if (_activeGroup == null) return;
    _loading = true;
    notifyListeners();
    try {
      await api.updateCamera(
        cameraId: cameraId,
        namaRuangan: namaRuangan,
        lokasiCctv: lokasiCctv,
      );
      _activeGroup = await api.getGroupDetail(_activeGroup!.id);
      await loadEvents();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> deleteRoomCamera(int cameraId) async {
    if (_activeGroup == null) return;
    _loading = true;
    notifyListeners();
    try {
      await api.deleteCamera(cameraId);
      _activeGroup = await api.getGroupDetail(_activeGroup!.id);
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> removeFamilyMember(int userId) async {
    if (_activeGroup == null) return;
    _loading = true;
    notifyListeners();
    try {
      await api.removeMember(groupId: _activeGroup!.id, userId: userId);
      _activeGroup = await api.getGroupDetail(_activeGroup!.id);
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> setFilters({
    String? status,
    String? dateFrom,
    String? dateTo,
    bool clearDates = false,
  }) async {
    if (status != null) _statusFilter = status;
    if (clearDates) {
      _dateFrom = null;
      _dateTo = null;
    } else {
      if (dateFrom != null) _dateFrom = dateFrom;
      if (dateTo != null) _dateTo = dateTo;
    }
    await loadEvents();
    notifyListeners();
  }

  Future<void> loadEvents() async {
    if (_activeGroup == null) {
      _events = [];
      return;
    }
    _events = await api.getEvents(
      groupId: _activeGroup!.id,
      status: _statusFilter.isEmpty ? null : _statusFilter,
      dateFrom: _dateFrom,
      dateTo: _dateTo,
    );
    notifyListeners();
  }

  Future<FallEventModel> markEventStatus(int eventId, String status) async {
    final updated = await api.updateEventStatus(eventId: eventId, status: status);
    _events = _events.map((e) => e.id == updated.id ? updated : e).toList();
    notifyListeners();
    return updated;
  }

  void _connectGroupWebSocket(int groupId) {
    _startVoicePolling();
    if (_wsGroupId == groupId && _wsChannel != null) return;
    _disconnectWebSocket(keepPolling: true);
    _wsGroupId = groupId;

    try {
      final wsUri = Uri.parse(api.getGroupWsUrl(groupId));
      _wsChannel = WebSocketChannel.connect(wsUri);
      _wsSub = _wsChannel!.stream.listen(
        (raw) {
          try {
            final data = Map<String, dynamic>.from(jsonDecode(raw.toString()) as Map);
            final type = data['type']?.toString();
            if (type == 'event.created' && data['event'] is Map) {
              final created = FallEventModel.fromJson(
                Map<String, dynamic>.from(data['event'] as Map),
              );
              final alreadyExists = _events.any((e) => e.id == created.id);
              _events = [
                created,
                ..._events.where((e) => e.id != created.id),
              ];
              notifyListeners();

              if (!alreadyExists) {
                NotificationService.instance.showFallHeadsUpNotification(
                  eventId: created.id,
                  title: 'Peringatan jatuh!',
                  body: '${created.namaLansia} terdeteksi jatuh di ${created.cameraName} (${created.effectiveLokasiCctv})',
                );
              }
            } else if (type == 'event.updated' && data['event'] is Map) {
              final updated = FallEventModel.fromJson(
                Map<String, dynamic>.from(data['event'] as Map),
              );
              _events = _events.map((e) => e.id == updated.id ? updated : e).toList();
              notifyListeners();
            } else if (type == 'cctv.voice') {
              _handleIncomingCctvVoice(data);
            } else if (type == 'emergency.contact' && _activeGroup != null) {
              final newPhone = data['kontak_darurat']?.toString() ?? '';
              if (newPhone.isNotEmpty) {
                _activeGroup = _activeGroup!.copyWith(kontakDarurat: newPhone);
                loadEvents();
                notifyListeners();
              }
            } else if (type == 'camera.status' && _activeGroup != null) {
              final camId = (data['camera_id'] as num?)?.toInt();
              final newStatus = data['status']?.toString();
              if (camId != null && newStatus != null) {
                final updatedCams = _activeGroup!.cameras
                    .map((c) => c.id == camId ? c.copyWith(status: newStatus) : c)
                    .toList();
                _activeGroup = _activeGroup!.copyWith(cameras: updatedCams);
                notifyListeners();
              }
            }
          } catch (_) {}
        },
        onDone: () => _scheduleWsReconnect(groupId),
        onError: (_) => _scheduleWsReconnect(groupId),
      );
    } catch (_) {
      _scheduleWsReconnect(groupId);
    }
  }

  void _scheduleWsReconnect(int groupId) {
    _wsChannel = null;
    _wsReconnectTimer?.cancel();
    if (!isAuthenticated || _activeGroup?.id != groupId) return;
    _wsReconnectTimer = Timer(const Duration(seconds: 4), () {
      if (isAuthenticated && _activeGroup?.id == groupId) {
        _wsGroupId = null;
        _connectGroupWebSocket(groupId);
      }
    });
  }

  void _disconnectWebSocket({bool keepPolling = false}) {
    if (!keepPolling) {
      _voicePollTimer?.cancel();
      _voicePollTimer = null;
    }
    _wsReconnectTimer?.cancel();
    _wsSub?.cancel();
    _wsChannel?.sink.close();
    _wsChannel = null;
    _wsGroupId = null;
  }

  @override
  void dispose() {
    _disconnectWebSocket();
    _tokenRefreshSub?.cancel();
    _playerStateSub?.cancel();
    _audioPlayer.dispose();
    super.dispose();
  }
}
