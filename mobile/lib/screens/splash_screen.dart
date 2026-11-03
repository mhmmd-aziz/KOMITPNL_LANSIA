import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

class SplashScreen extends StatefulWidget {
  final VoidCallback onFinished;

  const SplashScreen({super.key, required this.onFinished});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  VideoPlayerController? _controller;
  Timer? _fallbackTimer;
  bool _completed = false;
  bool _videoInitialized = false;

  @override
  void initState() {
    super.initState();
    // Mode layar penuh imersif tanpa status bar & navigation bar di semua ukuran HP
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    _startSplashVideo();
    // Pengaman maksimal 5,5 detik agar aplikasi tetap masuk walau dekoder perangkat lambat
    _fallbackTimer = Timer(const Duration(milliseconds: 5500), _completeSplash);
  }

  Future<void> _startSplashVideo() async {
    final ctrl = VideoPlayerController.asset(
      'assets/videos/splash_intro.mp4',
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
    );
    _controller = ctrl;

    try {
      await ctrl.initialize();
      await ctrl.setLooping(false);
      // Wajib 100% tanpa suara di semua HP
      await ctrl.setVolume(0.0);
      ctrl.addListener(_checkVideoEnd);
      if (mounted) {
        setState(() => _videoInitialized = true);
      }
      await ctrl.play();
    } catch (_) {
      // Jika perangkat gagal mendekode video, tampilkan logo sebentar lalu masuk
      Future<void>.delayed(const Duration(milliseconds: 1400), _completeSplash);
    }
  }

  void _checkVideoEnd() {
    final ctrl = _controller;
    if (ctrl == null || !ctrl.value.isInitialized) return;
    final dur = ctrl.value.duration;
    final pos = ctrl.value.position;
    if (dur > Duration.zero && pos >= dur - const Duration(milliseconds: 80)) {
      _completeSplash();
    }
  }

  void _completeSplash() {
    if (_completed) return;
    _completed = true;
    _fallbackTimer?.cancel();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    if (mounted) {
      widget.onFinished();
    }
  }

  @override
  void dispose() {
    _fallbackTimer?.cancel();
    _controller?.removeListener(_checkVideoEnd);
    _controller?.dispose();
    if (!_completed) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = _controller;
    return Scaffold(
      backgroundColor: const Color(0xFFFCFCFC),
      body: MediaQuery.removePadding(
        context: context,
        removeTop: true,
        removeBottom: true,
        removeLeft: true,
        removeRight: true,
        child: SizedBox.expand(
          child: _videoInitialized && ctrl != null && ctrl.value.isInitialized
              ? FittedBox(
                  fit: BoxFit.cover,
                  clipBehavior: Clip.hardEdge,
                  child: SizedBox(
                    width: ctrl.value.size.width > 0 ? ctrl.value.size.width : 720,
                    height: ctrl.value.size.height > 0 ? ctrl.value.size.height : 1280,
                    child: VideoPlayer(ctrl),
                  ),
                )
              : Center(
                  child: Image.asset(
                    'assets/images/logo_aplikasi.png',
                    width: 148,
                    height: 148,
                    fit: BoxFit.contain,
                  ),
                ),
        ),
      ),
    );
  }
}

