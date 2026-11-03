import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Abaikan bila google-services.json belum dipasang saat pengembangan lokal
  }
}

class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  static const String channelId = 'sigap_fall_alert';
  static const String channelName = 'Peringatan Jatuh Lansia (SIGAP)';

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  bool _firebaseInitialized = false;
  void Function(int eventId)? _onEventTapped;
  int? _pendingInitialEventId;

  int? consumePendingEventId() {
    final id = _pendingInitialEventId;
    _pendingInitialEventId = null;
    return id;
  }

  void setOnEventTapped(void Function(int eventId) callback) {
    _onEventTapped = callback;
  }

  Future<void> initialize() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidSettings);

    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (NotificationResponse response) {
        final payload = response.payload;
        final eventId = int.tryParse(payload ?? '');
        if (eventId != null) {
          if (_onEventTapped != null) {
            _onEventTapped!(eventId);
          } else {
            _pendingInitialEventId = eventId;
          }
        }
      },
    );

    final androidPlugin = _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.requestNotificationsPermission();
    await androidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        channelId,
        channelName,
        description: 'Notifikasi darurat prioritas tinggi saat lansia terdeteksi jatuh',
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
      ),
    );

    try {
      await Firebase.initializeApp();
      _firebaseInitialized = true;

      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      // Saat aplikasi dibuka dari kondisi tertutup (terminated) melalui ketukan FCM
      final initialMsg = await FirebaseMessaging.instance.getInitialMessage();
      _handleRemoteTap(initialMsg, isInitial: true);

      // Saat aplikasi dibuka dari background melalui ketukan FCM
      FirebaseMessaging.onMessageOpenedApp.listen(_handleRemoteTap);

      // Saat aplikasi sedang terbuka (foreground): tampilkan heads-up local notification
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        final eventId = int.tryParse(message.data['event_id']?.toString() ?? '');
        final title = message.notification?.title ?? 'Peringatan jatuh!';
        final body =
            message.notification?.body ?? 'Lansia terdeteksi jatuh. Ketuk untuk bertindak.';
        showFallHeadsUpNotification(
          eventId: eventId ?? 0,
          title: title,
          body: body,
        );
      });
    } catch (e) {
      debugPrint(
        'Info SIGAP: Firebase belum aktif ($e). Notifikasi lokal via WebSocket tetap berjalan.',
      );
      _firebaseInitialized = false;
    }
  }

  void _handleRemoteTap(RemoteMessage? message, {bool isInitial = false}) {
    if (message == null) return;
    final eventId = int.tryParse(message.data['event_id']?.toString() ?? '');
    if (eventId == null) return;

    if (!isInitial && _onEventTapped != null) {
      _onEventTapped!(eventId);
    } else {
      _pendingInitialEventId = eventId;
    }
  }

  Future<String?> getFcmToken() async {
    if (!_firebaseInitialized) return null;
    try {
      return await FirebaseMessaging.instance.getToken();
    } catch (_) {
      return null;
    }
  }

  Stream<String>? get onTokenRefresh {
    if (!_firebaseInitialized) return null;
    return FirebaseMessaging.instance.onTokenRefresh;
  }

  Future<void> showFallHeadsUpNotification({
    required int eventId,
    required String title,
    required String body,
  }) async {
    const androidDetails = AndroidNotificationDetails(
      channelId,
      channelName,
      channelDescription: 'Notifikasi darurat prioritas tinggi saat lansia jatuh',
      importance: Importance.max,
      priority: Priority.high,
      playSound: true,
      enableVibration: true,
      fullScreenIntent: true,
    );

    await _localNotifications.show(
      eventId > 0 ? eventId : DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      const NotificationDetails(android: androidDetails),
      payload: eventId > 0 ? eventId.toString() : null,
    );
  }
}

