import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/group_model.dart';
import '../services/sigap_provider.dart';
import '../theme/app_colors.dart';
import '../widgets/mjpeg_stream_view.dart';
import '../widgets/push_to_talk_button.dart';

class LiveViewScreen extends StatefulWidget {
  final int? initialCameraId;

  const LiveViewScreen({super.key, this.initialCameraId});

  @override
  State<LiveViewScreen> createState() => _LiveViewScreenState();
}

class _LiveViewScreenState extends State<LiveViewScreen> {
  int? _selectedCameraId;

  @override
  void initState() {
    super.initState();
    _selectedCameraId = widget.initialCameraId;
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

    return Scaffold(
      appBar: AppBar(
        title: Text(group != null ? 'Live View — ${group.namaLansia}' : 'Live View CCTV'),
      ),
      body: SafeArea(
        child: cameras.isEmpty || activeCam == null
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
                          labelText: 'Pilih Kamera Ruangan',
                        ),
                        items: cameras
                            .map(
                              (c) => DropdownMenuItem(
                                value: c.id,
                                child: Text('${c.namaRuangan} (${c.status})'),
                              ),
                            )
                            .toList(),
                        onChanged: (val) => setState(() => _selectedCameraId = val),
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
                        Text(
                          'Ruangan: ${activeCam.namaRuangan}',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    MjpegStreamView(
                      streamUrl: provider.api.getCameraStreamUrl(activeCam.id),
                    ),
                    const SizedBox(height: 16),
                    PushToTalkButton(
                      cameraId: activeCam.id,
                      api: provider.api,
                    ),
                    const SizedBox(height: 12),
                    if (group != null)
                      SizedBox(
                        height: 56,
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
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
      ),
    );
  }
}

