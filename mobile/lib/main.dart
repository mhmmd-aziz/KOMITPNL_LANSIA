import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'screens/event_detail_screen.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'services/notification_service.dart';
import 'services/sigap_provider.dart';
import 'theme/app_colors.dart';

final GlobalKey<NavigatorState> sigapNavigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await NotificationService.instance.initialize();

  final sigapProvider = SigapProvider();
  await sigapProvider.init();

  runApp(
    ChangeNotifierProvider<SigapProvider>.value(
      value: sigapProvider,
      child: const SigapApp(),
    ),
  );
}

class SigapApp extends StatefulWidget {
  const SigapApp({super.key});

  @override
  State<SigapApp> createState() => _SigapAppState();
}

class _SigapAppState extends State<SigapApp> {
  @override
  void initState() {
    super.initState();
    NotificationService.instance.setOnEventTapped(_openEventFromNotification);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final initialEventId = NotificationService.instance.consumePendingEventId();
      if (initialEventId != null) {
        _openEventFromNotification(initialEventId);
      }
    });
  }

  void _openEventFromNotification(int eventId) {
    final provider = context.read<SigapProvider>();
    if (!provider.isAuthenticated) return;

    sigapNavigatorKey.currentState?.push(
      MaterialPageRoute(
        builder: (_) => EventDetailScreen(eventId: eventId),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<SigapProvider>();

    return MaterialApp(
      title: 'SIGAP Keluarga',
      debugShowCheckedModeBanner: false,
      navigatorKey: sigapNavigatorKey,
      theme: AppColors.lightTheme,
      home: provider.isInitializing
          ? const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            )
          : provider.isAuthenticated
              ? const HomeScreen()
              : const LoginScreen(),
    );
  }
}
