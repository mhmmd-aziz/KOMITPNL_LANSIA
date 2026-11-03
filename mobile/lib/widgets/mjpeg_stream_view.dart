import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class MjpegStreamView extends StatefulWidget {
  final String streamUrl;

  const MjpegStreamView({super.key, required this.streamUrl});

  @override
  State<MjpegStreamView> createState() => _MjpegStreamViewState();
}

class _MjpegStreamViewState extends State<MjpegStreamView> {
  HttpClient? _client;
  StreamSubscription<List<int>>? _subscription;
  Uint8List? _currentFrame;
  String? _error;
  bool _connecting = true;

  @override
  void initState() {
    super.initState();
    _startStream();
  }

  @override
  void didUpdateWidget(covariant MjpegStreamView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.streamUrl != widget.streamUrl) {
      _stopStream();
      _startStream();
    }
  }

  Future<void> _startStream() async {
    setState(() {
      _connecting = true;
      _error = null;
    });

    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 6);
    _client = client;

    try {
      final request = await client.getUrl(Uri.parse(widget.streamUrl));
      final response = await request.close();
      if (response.statusCode != 200) {
        if (!mounted) return;
        setState(() {
          _connecting = false;
          _error = 'Kamera sedang offline (kode ${response.statusCode}).';
        });
        return;
      }

      final buffer = <int>[];
      _subscription = response.listen(
        (chunk) {
          buffer.addAll(chunk);
          // Cari penanda JPEG SOI (FF D8) dan EOI (FF D9)
          while (true) {
            int start = -1;
            for (int i = 0; i < buffer.length - 1; i++) {
              if (buffer[i] == 0xFF && buffer[i + 1] == 0xD8) {
                start = i;
                break;
              }
            }
            if (start == -1) {
              if (buffer.length > 4096) {
                buffer.removeRange(0, buffer.length - 2);
              }
              break;
            }

            int end = -1;
            for (int j = start + 2; j < buffer.length - 1; j++) {
              if (buffer[j] == 0xFF && buffer[j + 1] == 0xD9) {
                end = j + 2;
                break;
              }
            }
            if (end == -1) {
              if (start > 0) buffer.removeRange(0, start);
              break;
            }

            final jpg = Uint8List.fromList(buffer.sublist(start, end));
            buffer.removeRange(0, end);

            if (mounted) {
              setState(() {
                _currentFrame = jpg;
                _connecting = false;
                _error = null;
              });
            }
          }
        },
        onError: (_) {
          if (mounted) {
            setState(() {
              _connecting = false;
              _error = 'Stream kamera terputus.';
            });
          }
        },
        onDone: () {
          if (mounted && _currentFrame == null) {
            setState(() {
              _connecting = false;
              _error = 'Kamera belum mengirim stream video.';
            });
          }
        },
      );
    } catch (_) {
      if (mounted) {
        setState(() {
          _connecting = false;
          _error = 'Tidak dapat tersambung ke kamera ruangan.';
        });
      }
    }
  }

  void _stopStream() {
    _subscription?.cancel();
    _subscription = null;
    _client?.close(force: true);
    _client = null;
  }

  @override
  void dispose() {
    _stopStream();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.videoFrame,
        borderRadius: BorderRadius.circular(12),
      ),
      clipBehavior: Clip.antiAlias,
      child: AspectRatio(
        aspectRatio: 4 / 3,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_currentFrame != null) {
      return Stack(
        fit: StackFit.expand,
        children: [
          Image.memory(
            _currentFrame!,
            fit: BoxFit.contain,
            gaplessPlayback: true,
          ),
          Positioned(
            top: 10,
            right: 10,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.65),
                borderRadius: BorderRadius.circular(999),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.circle, size: 9, color: AppColors.onlineDot),
                  SizedBox(width: 5),
                  Text(
                    'LIVE',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    if (_connecting) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: Colors.white),
            SizedBox(height: 12),
            Text(
              'Menghubungkan Live View kamera...',
              style: TextStyle(color: Colors.white70, fontSize: 13),
            ),
          ],
        ),
      );
    }

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.videocam_off_outlined, color: Colors.white60, size: 38),
            const SizedBox(height: 10),
            Text(
              _error ?? 'Stream kamera tidak tersedia.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70, fontSize: 13),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () {
                _stopStream();
                _startStream();
              },
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: const BorderSide(color: Colors.white54),
              ),
              icon: const Icon(Icons.refresh, size: 17),
              label: const Text('Coba Lagi'),
            ),
          ],
        ),
      ),
    );
  }
}

