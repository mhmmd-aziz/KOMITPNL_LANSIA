import 'dart:async';
import 'dart:convert';
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

  final ApiService api = ApiService();

  bool _initializing = true;
  bool _loading = false;
  UserModel? _user;
  List<FamilyGroupModel> _groups = [];
  FamilyGroupModel? _activeGroup;
  List<FallEventModel> _events = [];

  String _statusFilter = '';
  String? _dateFrom;
  String? _dateTo;

  WebSocketChannel? _wsChannel;
  StreamSubscription? _wsSub;
  StreamSubscription<String>? _tokenRefreshSub;
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

  FallEventModel? get latestUnhandledEvent {
    for (final ev in _events) {
      if (ev.isUnhandled) return ev;
    }
    return null;
  }

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final savedUrl = prefs.getString(_prefBackendUrlKey);
    if (savedUrl != null && savedUrl.isNotEmpty) {
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
    await _tokenRefreshSub?.cancel();
    api.setToken(null);
    _user = null;
    _groups = [];
    _activeGroup = null;
    _events = [];

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
    await loadEvents();
    _connectGroupWebSocket(groupId);
    notifyListeners();
  }

  Future<void> joinGroupByCode(String code) async {
    _loading = true;
    notifyListeners();
    try {
      final joined = await api.joinGroup(code);
      await refreshGroupsAndEvents();
      await selectGroup(joined.id);
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
    if (_wsGroupId == groupId && _wsChannel != null) return;
    _disconnectWebSocket();
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
                  body: '${created.namaLansia} terdeteksi jatuh di ${created.cameraName}',
                );
              }
            } else if (type == 'event.updated' && data['event'] is Map) {
              final updated = FallEventModel.fromJson(
                Map<String, dynamic>.from(data['event'] as Map),
              );
              _events = _events.map((e) => e.id == updated.id ? updated : e).toList();
              notifyListeners();
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

  void _disconnectWebSocket() {
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
    super.dispose();
  }
}

