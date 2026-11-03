import 'dart:io';
import 'package:dio/dio.dart';
import '../models/event_model.dart';
import '../models/group_model.dart';
import '../models/user_model.dart';

class ApiService {
  static const String defaultBackendUrl = String.fromEnvironment(
    'BACKEND_URL',
    defaultValue: 'http://10.0.2.2:8000',
  );

  late final Dio _dio;
  String _baseUrl = defaultBackendUrl;
  String? _token;

  ApiService() {
    _dio = Dio(
      BaseOptions(
        baseUrl: _baseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 15),
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
    return event.snapshotUrl;
  }

  String getCameraStreamUrl(int cameraId) {
    final encoded = Uri.encodeQueryComponent(_token ?? '');
    return '$_baseUrl/cameras/$cameraId/stream?token=$encoded';
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

  Future<FamilyGroupModel> joinGroup(String kodeUndangan) async {
    final res = await _dio.post(
      '/groups/join',
      data: {'kode_undangan': kodeUndangan.trim().toUpperCase()},
    );
    return FamilyGroupModel.fromJson(Map<String, dynamic>.from(res.data as Map));
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
}

