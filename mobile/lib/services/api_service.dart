import 'dart:io';
import 'package:dio/dio.dart';
import '../models/event_model.dart';
import '../models/group_model.dart';
import '../models/user_model.dart';

class ApiService {
  static const String defaultBackendUrl = String.fromEnvironment(
    'BACKEND_URL',
    defaultValue: 'http://192.168.0.129:8000',
  );

  late final Dio _dio;
  String _baseUrl = defaultBackendUrl;
  String? _token;

  ApiService() {
    _dio = Dio(
      BaseOptions(
        baseUrl: _baseUrl,
        connectTimeout: const Duration(seconds: 12),
        receiveTimeout: const Duration(seconds: 30),
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          options.baseUrl = _baseUrl;
          if (_token != null && _token!.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $_token';
          }
          handler.next(options);
        },
      ),
    );
  }

  String get baseUrl => _baseUrl;
  String? get token => _token;

  void setBaseUrl(String url) {
    final cleaned = url.trim().replaceAll(RegExp(r'/+$'), '');
    if (cleaned.isNotEmpty) {
      _baseUrl = cleaned;
      _dio.options.baseUrl = _baseUrl;
    }
  }

  void setToken(String? token) {
    _token = token;
  }

  String resolveSnapshotUrl(FallEventModel event) {
    if (event.snapshotPath.isNotEmpty) {
      final rel = event.snapshotPath.replaceFirst(RegExp(r'^/+'), '');
      return '$_baseUrl/$rel';
    }
    return resolveMediaUrl(event.snapshotUrl);
  }

  /// Pastikan semua URL media (/uploads/...) selalu mengarah ke IP LAN Server aktif (bukan localhost Laptop).
  String resolveMediaUrl(String rawUrlOrPath) {
    final trimmed = rawUrlOrPath.trim();
    if (trimmed.isEmpty) return '';
    final uploadsIdx = trimmed.indexOf('uploads/');
    if (uploadsIdx >= 0) {
      final rel = trimmed.substring(uploadsIdx);
      return '$_baseUrl/$rel';
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      final rel = trimmed.replaceFirst(RegExp(r'^/+'), '');
      return '$_baseUrl/$rel';
    }
    return trimmed;
  }

  /// Unduh file suara ke cache lokal HP agar AudioPlayer dapat memutar lewat DeviceFileSource tanpa gagal streaming.
  Future<File> downloadVoiceToTempFile(String rawUrlOrPath) async {
    final resolved = resolveMediaUrl(rawUrlOrPath);
    final uri = Uri.parse(resolved);
    final seg = uri.pathSegments.isNotEmpty ? uri.pathSegments.last : 'voice.wav';
    final safeName = seg.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_');
    final tempFile = File('${Directory.systemTemp.path}/sigap_play_$safeName');
    if (await tempFile.exists() && await tempFile.length() > 100) {
      return tempFile;
    }
    final res = await _dio.get<List<int>>(
      resolved,
      options: Options(responseType: ResponseType.bytes),
    );
    final bytes = res.data ?? <int>[];
    await tempFile.writeAsBytes(bytes, flush: true);
    return tempFile;
  }

  String getCameraStreamUrl(int cameraId) {
    final encoded = Uri.encodeQueryComponent(_token ?? '');
    return '$_baseUrl/cameras/$cameraId/stream?token=$encoded';
  }

  String getSimulationStreamUrl(int cameraId, {String nonce = ''}) {
    final encoded = Uri.encodeQueryComponent(_token ?? '');
    final bust = nonce.isNotEmpty ? '&_t=${Uri.encodeQueryComponent(nonce)}' : '';
    return '$_baseUrl/simulations/stream?camera_id=$cameraId&token=$encoded$bust';
  }

  String getSimulationVideoFileUrl(
    String videoName,
    int cameraId, {
    String rev = '',
  }) {
    final encodedToken = Uri.encodeQueryComponent(_token ?? '');
    final encodedVid = Uri.encodeQueryComponent(videoName);
    final bust = rev.isNotEmpty ? '&_v=${Uri.encodeQueryComponent(rev)}' : '';
    return '$_baseUrl/simulations/video-file?video_name=$encodedVid&camera_id=$cameraId&token=$encodedToken$bust';
  }

  String getGroupWsUrl(int groupId) {
    final wsBase = _baseUrl.replaceFirst(RegExp(r'^http'), 'ws');
    final encoded = Uri.encodeQueryComponent(_token ?? '');
    return '$wsBase/ws/groups/$groupId?token=$encoded';
  }

  static String extractError(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map && data['detail'] != null) {
        return data['detail'].toString();
      }
      if (error.type == DioExceptionType.connectionTimeout ||
          error.type == DioExceptionType.connectionError) {
        return 'Tidak dapat terhubung ke server. Periksa IP LAN Server & jaringan Wi-Fi/Hotspot.';
      }
    }
    return 'Terjadi kesalahan koneksi ke server.';
  }

  Future<({String token, UserModel user})> login({
    required String email,
    required String password,
  }) async {
    final res = await _dio.post(
      '/auth/login',
      data: {'email': email.trim(), 'password': password},
    );
    final data = Map<String, dynamic>.from(res.data as Map);
    final accessToken = data['access_token'].toString();
    final user = UserModel.fromJson(Map<String, dynamic>.from(data['user'] as Map));
    setToken(accessToken);
    return (token: accessToken, user: user);
  }

  Future<({String token, UserModel user})> register({
    required String nama,
    required String email,
    required String password,
  }) async {
    final res = await _dio.post(
      '/auth/register',
      data: {
        'nama': nama.trim(),
        'email': email.trim(),
        'password': password,
        'role': 'keluarga',
      },
    );
    final data = Map<String, dynamic>.from(res.data as Map);
    final accessToken = data['access_token'].toString();
    final user = UserModel.fromJson(Map<String, dynamic>.from(data['user'] as Map));
    setToken(accessToken);
    return (token: accessToken, user: user);
  }

  Future<void> saveFcmToken(String fcmToken) async {
    if (_token == null || fcmToken.trim().isEmpty) return;
    await _dio.post('/devices/fcm-token', data: {'fcm_token': fcmToken.trim()});
  }

  Future<List<FamilyGroupModel>> getGroups() async {
    final res = await _dio.get('/groups');
    final list = res.data as List<dynamic>;
    return list
        .map((e) => FamilyGroupModel.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<FamilyGroupModel> getGroupDetail(int groupId) async {
    final res = await _dio.get('/groups/$groupId');
    return FamilyGroupModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<FamilyGroupModel> createGroup({
    required String namaGrup,
    required String namaLansia,
    required String kontakDarurat,
    String? kodeUndangan,
    String? namaRuanganAwal,
  }) async {
    final payload = <String, dynamic>{
      'nama_grup': namaGrup.trim(),
      'nama_lansia': namaLansia.trim(),
      'kontak_darurat': kontakDarurat.trim(),
    };
    if (kodeUndangan != null && kodeUndangan.trim().isNotEmpty) {
      payload['kode_undangan'] = kodeUndangan.trim().toUpperCase();
    }
    if (namaRuanganAwal != null && namaRuanganAwal.trim().isNotEmpty) {
      payload['nama_ruangan_awal'] = namaRuanganAwal.trim();
    }
    final res = await _dio.post('/groups', data: payload);
    return FamilyGroupModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<FamilyGroupModel> updateGroup({
    required int groupId,
    String? namaGrup,
    String? namaLansia,
    String? kontakDarurat,
    String? kodeUndangan,
  }) async {
    final payload = <String, dynamic>{};
    if (namaGrup != null) payload['nama_grup'] = namaGrup.trim();
    if (namaLansia != null) payload['nama_lansia'] = namaLansia.trim();
    if (kontakDarurat != null) payload['kontak_darurat'] = kontakDarurat.trim();
    if (kodeUndangan != null && kodeUndangan.trim().isNotEmpty) {
      payload['kode_undangan'] = kodeUndangan.trim().toUpperCase();
    }
    final res = await _dio.patch('/groups/$groupId', data: payload);
    return FamilyGroupModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<bool> verifyFamilyCode({
    required int groupId,
    required String kodeUndangan,
  }) async {
    final res = await _dio.post(
      '/groups/$groupId/verify-code',
      data: {'kode_undangan': kodeUndangan.trim().toUpperCase()},
    );
    final data = Map<String, dynamic>.from(res.data as Map);
    return data['valid'] == true;
  }

  Future<FamilyGroupModel> joinGroup(String kodeUndangan) async {
    final res = await _dio.post(
      '/groups/join',
      data: {'kode_undangan': kodeUndangan.trim().toUpperCase()},
    );
    return FamilyGroupModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<CameraModel> addCamera({
    required int groupId,
    required String namaRuangan,
    String lokasiCctv = '',
    String sumber = 'idle',
  }) async {
    final res = await _dio.post(
      '/groups/$groupId/cameras',
      data: {
        'nama_ruangan': namaRuangan.trim(),
        'lokasi_cctv': lokasiCctv.trim(),
        'sumber': sumber.trim().isEmpty ? 'idle' : sumber.trim(),
      },
    );
    return CameraModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<CameraModel> updateCamera({
    required int cameraId,
    String? namaRuangan,
    String? lokasiCctv,
  }) async {
    final payload = <String, dynamic>{};
    if (namaRuangan != null && namaRuangan.trim().isNotEmpty) {
      payload['nama_ruangan'] = namaRuangan.trim();
    }
    if (lokasiCctv != null) {
      payload['lokasi_cctv'] = lokasiCctv.trim();
    }
    final res = await _dio.patch('/cameras/$cameraId', data: payload);
    return CameraModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<void> deleteCamera(int cameraId) async {
    await _dio.delete('/cameras/$cameraId');
  }

  Future<void> removeMember({
    required int groupId,
    required int userId,
  }) async {
    await _dio.delete('/groups/$groupId/members/$userId');
  }

  Future<List<FallEventModel>> getEvents({
    int? groupId,
    String? status,
    String? dateFrom,
    String? dateTo,
  }) async {
    final params = <String, dynamic>{};
    if (groupId != null) params['group_id'] = groupId;
    if (status != null && status.isNotEmpty) params['status'] = status;
    if (dateFrom != null && dateFrom.isNotEmpty) params['date_from'] = dateFrom;
    if (dateTo != null && dateTo.isNotEmpty) params['date_to'] = dateTo;

    final res = await _dio.get('/events', queryParameters: params);
    final list = res.data as List<dynamic>;
    return list
        .map((e) => FallEventModel.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<FallEventModel> getEventDetail(int eventId) async {
    final res = await _dio.get('/events/$eventId');
    return FallEventModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<FallEventModel> updateEventStatus({
    required int eventId,
    required String status,
  }) async {
    final res = await _dio.patch(
      '/events/$eventId',
      data: {'status': status},
    );
    return FallEventModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<String> uploadVoiceMessage({
    required int cameraId,
    required File audioFile,
  }) async {
    final formData = FormData.fromMap({
      'audio': await MultipartFile.fromFile(
        audioFile.path,
        filename: 'pesan_suara.m4a',
      ),
    });
    final res = await _dio.post('/cameras/$cameraId/voice', data: formData);
    final data = Map<String, dynamic>.from(res.data as Map);
    return (data['message'] ?? 'Pesan suara terkirim.').toString();
  }

  Future<List<Map<String, dynamic>>> getCameraVoices({
    required int cameraId,
  }) async {
    final res = await _dio.get('/cameras/$cameraId/voices');
    final data = Map<String, dynamic>.from(res.data as Map);
    final raw = (data['items'] as List<dynamic>?) ?? <dynamic>[];
    return raw.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  // ===========================================================================
  // Kalibrasi Area Aman 4-Titik & Upload Video POV Prototype Milik Keluarga
  // ===========================================================================
  Future<List<Map<String, dynamic>>> getSimulationVideos({
    required int cameraId,
  }) async {
    final res = await _dio.get(
      '/simulations/videos',
      queryParameters: {'camera_id': cameraId},
    );
    final data = Map<String, dynamic>.from(res.data as Map);
    final raw = (data['videos'] as List<dynamic>?) ?? <dynamic>[];
    return raw.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<List<List<List<double>>>> prepareSimulationVideo({
    required int cameraId,
    required String videoName,
  }) async {
    final res = await _dio.post(
      '/simulations/prepare',
      data: {'camera_id': cameraId, 'video_name': videoName},
    );
    final data = Map<String, dynamic>.from(res.data as Map);
    return _parseZonesList(data['zones']);
  }

  Future<List<List<List<double>>>> saveSimulationZones({
    required int cameraId,
    required String videoName,
    required List<List<List<double>>> zones,
  }) async {
    final res = await _dio.post(
      '/simulations/zones',
      data: {
        'camera_id': cameraId,
        'video_name': videoName,
        'zones': zones,
      },
    );
    final data = Map<String, dynamic>.from(res.data as Map);
    return _parseZonesList(data['zones']);
  }

  Future<Map<String, dynamic>> uploadSimulationVideo({
    required int cameraId,
    required File videoFile,
  }) async {
    final name = videoFile.path.split(Platform.pathSeparator).last;
    final formData = FormData.fromMap({
      'camera_id': cameraId.toString(),
      'video': await MultipartFile.fromFile(
        videoFile.path,
        filename: name.isNotEmpty ? name : 'pov_keluarga.mp4',
      ),
    });
    final res = await _dio.post('/simulations/upload', data: formData);
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<String> runSimulationOnce({
    required int cameraId,
    required String videoName,
    required List<List<List<double>>> zones,
  }) async {
    final res = await _dio.post(
      '/simulations/run',
      data: {
        'camera_id': cameraId,
        'video_name': videoName,
        'zones': zones,
        'loop': false,
      },
    );
    final data = Map<String, dynamic>.from(res.data as Map);
    return (data['message'] ?? 'Analisis AI dimulai.').toString();
  }

  Future<void> stopSimulation({required int cameraId}) async {
    await _dio.post('/simulations/stop', data: {'camera_id': cameraId});
  }

  Future<Map<String, dynamic>> getSimulationTelemetry({
    required int cameraId,
  }) async {
    final res = await _dio.get(
      '/simulations/telemetry',
      queryParameters: {'camera_id': cameraId},
    );
    return Map<String, dynamic>.from(res.data as Map);
  }

  List<List<List<double>>> _parseZonesList(dynamic rawZones) {
    if (rawZones is! List) return <List<List<double>>>[];
    final out = <List<List<double>>>[];
    for (final poly in rawZones) {
      if (poly is List && poly.length >= 3) {
        final pts = <List<double>>[];
        for (final pt in poly) {
          if (pt is List && pt.length >= 2) {
            pts.add([
              (pt[0] as num).toDouble(),
              (pt[1] as num).toDouble(),
            ]);
          }
        }
        if (pts.length >= 3) out.add(pts);
      }
    }
    return out;
  }
}
