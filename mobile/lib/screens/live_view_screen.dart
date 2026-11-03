import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/group_model.dart';
import '../services/sigap_provider.dart';
import '../theme/app_colors.dart';
import '../utils/whatsapp_emergency.dart';
import '../widgets/mjpeg_stream_view.dart';
import '../widgets/push_to_talk_button.dart';

class LiveViewScreen extends StatefulWidget {
  final int? initialCameraId;
  final bool embeddedInTab;

  const LiveViewScreen({
    super.key,
    this.initialCameraId,
    this.embeddedInTab = false,
  });

  @override
  State<LiveViewScreen> createState() => _LiveViewScreenState();
}

class _LiveViewScreenState extends State<LiveViewScreen> {
  int? _selectedCameraId;
  List<Map<String, dynamic>> _voices = <Map<String, dynamic>>[];
  Timer? _voicePollTimer;

  @override
  void initState() {
    super.initState();
    _selectedCameraId = widget.initialCameraId;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refreshVoices();
      _voicePollTimer = Timer.periodic(
        const Duration(seconds: 3),
        (_) => _refreshVoices(),
      );
    });
  }

  @override
  void dispose() {
    _voicePollTimer?.cancel();
    super.dispose();
  }

  Future<void> _refreshVoices() async {
    if (!mounted) return;
    final provider = context.read<SigapProvider>();
    final cams = provider.activeGroup?.cameras ?? <CameraModel>[];
    if (cams.isEmpty) return;

    final activeCam = cams.firstWhere(
      (c) => c.id == _selectedCameraId,
      orElse: () => cams.first,
    );
    try {
      final list = await provider.api.getCameraVoices(cameraId: activeCam.id);
      if (mounted) {
        setState(() => _voices = list);
      }
    } catch (_) {}
  }

  Future<void> _callEmergency(String number) async {
    final clean = number.replaceAll(RegExp(r'[^0-9+]'), '');
    if (clean.isEmpty) return;
    final uri = Uri(scheme: 'tel', path: clean);
    await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<SigapProvider>();
    final group = provider.activeGroup;
    final cameras = group?.cameras ?? <CameraModel>[];

    CameraModel? activeCam;
    if (cameras.isNotEmpty) {
      activeCam = cameras.firstWhere(
        (c) => c.id == _selectedCameraId,
        orElse: () => cameras.first,
      );
    }

    final bodyContent = cameras.isEmpty || activeCam == null
        ? const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'Belum ada kamera terdaftar di grup keluarga ini.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textSecondary),
              ),
            ),
          )
        : SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (cameras.length > 1) ...[
                  DropdownButtonFormField<int>(
                    initialValue: activeCam.id,
                    decoration: const InputDecoration(
                      labelText: 'Pilih CCTV Ruangan Keluarga Anda',
                      prefixIcon: Icon(Icons.videocam_outlined),
                    ),
                    items: cameras
                        .map(
                          (c) => DropdownMenuItem(
                            value: c.id,
                            child: Text('${c.namaRuangan} (CCTV #${c.id})'),
                          ),
                        )
                        .toList(),
                    onChanged: (val) {
                      setState(() => _selectedCameraId = val);
                      _refreshVoices();
                    },
                  ),
                  const SizedBox(height: 12),
                ],
                Row(
                  children: [
                    Icon(
                      Icons.circle,
                      size: 11,
                      color: activeCam.isOnline
                          ? AppColors.onlineDot
                          : AppColors.textMuted,
                    ),
                    const SizedBox(width: 7),
                    Expanded(
                      child: Text(
                        'Ruangan: ${activeCam.namaRuangan}',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceMuted,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.location_on_rounded,
                        size: 16,
                        color: AppColors.sos,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Lokasi CCTV: ${activeCam.effectiveLokasiCctv(group?.namaGrup ?? '')}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                MjpegStreamView(
                  streamUrl: provider.api.getCameraStreamUrl(activeCam.id),
                ),
                const SizedBox(height: 16),

                // Komunikasi 2 Arah: HP -> Speaker Laptop
                PushToTalkButton(
                  cameraId: activeCam.id,
                  api: provider.api,
                ),
                const SizedBox(height: 14),

                // Komunikasi Balik: Mikrofon POV CCTV (Laptop) -> HP Keluarga
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.record_voice_over_rounded,
                              color: AppColors.primary,
                              size: 20,
                            ),
                            const SizedBox(width: 8),
                            const Expanded(
                              child: Text(
                                'Interkom Suara 2 Arah (POV CCTV <-> HP)',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 13.5,
                                  color: AppColors.textPrimary,
                                ),
                              ),
                            ),
                            IconButton(
                              onPressed: _refreshVoices,
                              icon: const Icon(Icons.refresh_rounded, size: 18),
                              tooltip: 'Segarkan Suara',
                            ),
                          ],
                        ),
                        const Text(
                          'Saat lansia berbicara dari mikrofon POV CCTV (Laptop), suaranya otomatis berbunyi di HP ini dan dapat diputar ulang di bawah:',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.textSecondary,
                          ),
                        ),
                        const SizedBox(height: 10),
                        if (_voices.isEmpty)
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppColors.surfaceMuted,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Text(
                              'Belum ada percakapan suara pada ruangan ini.',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppColors.textMuted,
                              ),
                            ),
                          )
                        else
                          ..._voices.take(5).map((v) {
                            final isFromCctv = v['direction'] == 'cctv_to_family';
                            final rawPathOrUrl =
                                (v['file_path'] ?? v['url'] ?? '').toString();
                            final url = provider.api.resolveMediaUrl(rawPathOrUrl);
                            final sender = v['sender_name']?.toString() ?? 'Suara';
                            final isPlayingThis =
                                provider.isPlayingVoice &&
                                provider.playingVoiceUrl == url;
                            return Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: isFromCctv
                                    ? AppColors.primarySoft
                                    : AppColors.surfaceMuted,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: isFromCctv
                                      ? AppColors.primaryBorder
                                      : AppColors.border,
                                ),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    isFromCctv
                                        ? Icons.graphic_eq_rounded
                                        : Icons.mic_none_rounded,
                                    size: 18,
                                    color: isFromCctv
                                        ? AppColors.primary
                                        : AppColors.textSecondary,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      isFromCctv
                                          ? 'Suara Masuk: $sender'
                                          : 'Anda ($sender) -> CCTV',
                                      style: TextStyle(
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.bold,
                                        color: isFromCctv
                                            ? AppColors.primaryDark
                                            : AppColors.textPrimary,
                                      ),
                                    ),
                                  ),
                                  FilledButton.tonalIcon(
                                    onPressed: url.isEmpty
                                        ? null
                                        : () {
                                            provider.markCctvVoiceRead();
                                            if (isPlayingThis) {
                                              provider.stopVoicePlayback();
                                            } else {
                                              provider.playVoiceUrl(url);
                                            }
                                          },
                                    icon: Icon(
                                      isPlayingThis
                                          ? Icons.stop_rounded
                                          : Icons.volume_up_rounded,
                                      size: 16,
                                    ),
                                    label: Text(
                                      isPlayingThis ? 'Stop' : 'Putar',
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                  ),
                                ],
                              ),
                            );
                          }),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                if (group != null) ...[
                  SizedBox(
                    height: 54,
                    child: FilledButton.icon(
                      onPressed: () =>
                          WhatsAppEmergencyHelper.sendCameraEmergencyToWhatsApp(
                        rawPhone: group.kontakDarurat,
                        namaLansia: group.namaLansia,
                        namaGrup: group.namaGrup,
                        camera: activeCam!,
                      ),
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF15803D),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      icon: const Icon(Icons.chat_rounded, size: 21),
                      label: const Text(
                        'KIRIM WA DARURAT + LOKASI CCTV',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 54,
                    child: FilledButton.icon(
                      onPressed: () => _callEmergency(group.kontakDarurat),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.sos,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      icon: const Icon(Icons.phone_in_talk_rounded, size: 22),
                      label: Text(
                        'TELEPON DARURAT (${group.kontakDarurat})',
                        style: const TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          );

    if (widget.embeddedInTab) return bodyContent;

    return Scaffold(
      appBar: AppBar(
        title: Text(group != null ? 'Live & Suara — ${group.namaLansia}' : 'Live View CCTV'),
      ),
      body: SafeArea(child: bodyContent),
    );
  }
}
