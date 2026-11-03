import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../services/api_service.dart';
import '../theme/app_colors.dart';

class PushToTalkButton extends StatefulWidget {
  final int cameraId;
  final ApiService api;

  const PushToTalkButton({
    super.key,
    required this.cameraId,
    required this.api,
  });

  @override
  State<PushToTalkButton> createState() => _PushToTalkButtonState();
}

class _PushToTalkButtonState extends State<PushToTalkButton> {
  final AudioRecorder _recorder = AudioRecorder();
  bool _isRecording = false;
  bool _isSending = false;

  @override
  void dispose() {
    _recorder.dispose();
    super.dispose();
  }

  Future<void> _startRecording() async {
    if (_isSending || _isRecording) return;
    final hasPerm = await _recorder.hasPermission();
    if (!hasPerm) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Izin mikrofon diperlukan untuk bicara ke CCTV.')),
      );
      return;
    }

    final tempDir = await getTemporaryDirectory();
    final filePath =
        '${tempDir.path}/sigap_ptt_${DateTime.now().millisecondsSinceEpoch}.m4a';

    await _recorder.start(
      const RecordConfig(
        encoder: AudioEncoder.aacLc,
        bitRate: 64000,
        sampleRate: 44100,
      ),
      path: filePath,
    );

    if (mounted) {
      setState(() => _isRecording = true);
    }
  }

  Future<void> _stopAndSend() async {
    if (!_isRecording) return;
    final recordedPath = await _recorder.stop();
    if (!mounted) return;

    setState(() {
      _isRecording = false;
      _isSending = true;
    });

    if (recordedPath == null) {
      setState(() => _isSending = false);
      return;
    }

    final file = File(recordedPath);
    try {
      final msg = await widget.api.uploadVoiceMessage(
        cameraId: widget.cameraId,
        audioFile: file,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.primary,
          content: Text(msg),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.sos,
          content: Text(ApiService.extractError(e)),
        ),
      );
    } finally {
      try {
        if (await file.exists()) await file.delete();
      } catch (_) {}
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bgColor = _isRecording ? AppColors.warning : AppColors.primary;
    final labelText = _isSending
        ? 'Mengirim Suara ke Speaker CCTV...'
        : _isRecording
            ? 'Sedang Merekam... Lepas untuk Kirim'
            : 'Tahan untuk Bicara ke Speaker CCTV';

    return GestureDetector(
      onLongPressStart: (_) => _startRecording(),
      onLongPressEnd: (_) => _stopAndSend(),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        width: double.infinity,
        height: 54,
        decoration: BoxDecoration(
          color: _isSending ? AppColors.primaryDark : bgColor,
          borderRadius: BorderRadius.circular(12),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (_isSending)
              const SizedBox(
                width: 19,
                height: 19,
                child: CircularProgressIndicator(
                  strokeWidth: 2.2,
                  color: Colors.white,
                ),
              )
            else
              Icon(
                _isRecording ? Icons.graphic_eq : Icons.mic_none_rounded,
                color: Colors.white,
                size: 22,
              ),
            const SizedBox(width: 10),
            Flexible(
              child: Text(
                labelText,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

