import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/event_model.dart';
import '../services/api_service.dart';
import '../services/sigap_provider.dart';
import '../theme/app_colors.dart';
import '../widgets/mjpeg_stream_view.dart';
import '../widgets/push_to_talk_button.dart';
import '../widgets/status_badge.dart';

String formatWaktuWib(String rawIso) {
  if (rawIso.isEmpty) return '-';
  try {
    final dt = DateTime.parse(rawIso).toUtc().add(const Duration(hours: 7));
    return '${DateFormat('dd MMM yyyy, HH:mm:ss').format(dt)} WIB';
  } catch (_) {
    return rawIso;
  }
}

class EventDetailScreen extends StatefulWidget {
  final int eventId;
  final FallEventModel? initialEvent;

  const EventDetailScreen({
    super.key,
    required this.eventId,
    this.initialEvent,
  });

  @override
  State<EventDetailScreen> createState() => _EventDetailScreenState();
}

class _EventDetailScreenState extends State<EventDetailScreen> {
  FallEventModel? _event;
  bool _loading = true;
  bool _updating = false;
  bool _showLiveStream = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _event = widget.initialEvent;
    _loading = _event == null;
    _fetchDetail();
  }

  Future<void> _fetchDetail() async {
    final provider = context.read<SigapProvider>();
    try {
      final fresh = await provider.api.getEventDetail(widget.eventId);
      if (!mounted) return;
      setState(() {
        _event = fresh;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (_event == null) {
          _error = ApiService.extractError(e);
        }
      });
    }
  }

  Future<void> _dialEmergency(String number) async {
    final clean = number.replaceAll(RegExp(r'[^0-9+]'), '');
    if (clean.isEmpty) return;
    final uri = Uri(scheme: 'tel', path: clean);
    await launchUrl(uri);
  }

  Future<void> _updateStatus(String status) async {
    if (_updating || _event == null) return;
    setState(() => _updating = true);
    final provider = context.read<SigapProvider>();
    try {
      final updated = await provider.markEventStatus(_event!.id, status);
      if (!mounted) return;
      setState(() => _event = updated);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: status == 'ditangani' ? AppColors.safe : AppColors.textSecondary,
          content: Text(
            status == 'ditangani'
                ? 'Kejadian ditandai Sudah Ditangani.'
                : 'Kejadian ditandai sebagai Alarm Palsu.',
          ),
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
      if (mounted) {
        setState(() => _updating = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<SigapProvider>();

    // Sinkronkan juga bila WebSocket memperbarui status dari anggota keluarga lain
    final syncedFromList = provider.events.where((e) => e.id == widget.eventId);
    if (syncedFromList.isNotEmpty) {
      _event = syncedFromList.first;
    }

    return Scaffold(
      appBar: AppBar(
        backgroundColor: (_event?.isUnhandled ?? false) ? AppColors.sosPressed : AppColors.primary,
        title: const Text(
          'Detail Kejadian Jatuh',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            onPressed: _fetchDetail,
            icon: const Icon(Icons.refresh),
            tooltip: 'Segarkan',
          ),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _event == null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        _error ?? 'Data kejadian tidak ditemukan.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: AppColors.dangerText),
                      ),
                    ),
                  )
                : SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Kartu ringkasan kejadian
                        Container(
                          padding: const EdgeInsets.all(15),
                          decoration: BoxDecoration(
                            color: _event!.isUnhandled
                                ? AppColors.dangerSoft
                                : AppColors.surface,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: _event!.isUnhandled
                                  ? AppColors.sos
                                  : AppColors.border,
                              width: _event!.isUnhandled ? 1.6 : 1.0,
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  StatusBadge(status: _event!.status),
                                  Text(
                                    'Keyakinan ${(_event!.confidence * 100).toStringAsFixed(0)}%',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.textMuted,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              Text(
                                '${_event!.namaLansia} — ${_event!.cameraName}',
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.textPrimary,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Waktu: ${formatWaktuWib(_event!.waktu)}',
                                style: const TextStyle(
                                  fontSize: 13.5,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                              if (_event!.handledByName != null) ...[
                                const SizedBox(height: 6),
                                Text(
                                  'Ditindaklanjuti oleh: ${_event!.handledByName}',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.safeText,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 14),

                        // Toggle Snapshot vs Live View Kamera langsung di halaman detail
                        SegmentedButton<bool>(
                          segments: const [
                            ButtonSegment(
                              value: false,
                              icon: Icon(Icons.photo_camera_outlined, size: 18),
                              label: Text('Snapshot Kejadian'),
                            ),
                            ButtonSegment(
                              value: true,
                              icon: Icon(Icons.videocam_outlined, size: 18),
                              label: Text('Live View Kamera'),
                            ),
                          ],
                          selected: {_showLiveStream},
                          onSelectionChanged: (sel) {
                            setState(() => _showLiveStream = sel.first);
                          },
                        ),
                        const SizedBox(height: 10),

                        if (_showLiveStream)
                          MjpegStreamView(
                            streamUrl: provider.api.getCameraStreamUrl(_event!.cameraId),
                          )
                        else
                          Container(
                            decoration: BoxDecoration(
                              color: AppColors.videoFrame,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: AspectRatio(
                              aspectRatio: 4 / 3,
                              child: Image.network(
                                provider.api.resolveSnapshotUrl(_event!),
                                fit: BoxFit.contain,
                                errorBuilder: (_, _, _) => const Center(
                                  child: Text(
                                    'Gagal memuat gambar snapshot.',
                                    style: TextStyle(color: Colors.white70),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        const SizedBox(height: 6),
                        const Text(
                          'Privasi: Wajah diburamkan otomatis dan video tidak disimpan.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 11.5, color: AppColors.textMuted),
                        ),
                        const SizedBox(height: 18),

                        // 1. TOMBOL SOS TELEPON DARURAT (<= 2 ketukan dari notifikasi)
                        SizedBox(
                          height: 60,
                          child: FilledButton.icon(
                            onPressed: () => _dialEmergency(_event!.kontakDarurat),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.sos,
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                            icon: const Icon(Icons.phone_in_talk_rounded, size: 25),
                            label: Text(
                              'TELEPON DARURAT (${_event!.kontakDarurat})',
                              style: const TextStyle(
                                fontSize: 15.5,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.3,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),

                        // 2. PUSH-TO-TALK SUARA KE SPEAKER CCTV
                        PushToTalkButton(
                          cameraId: _event!.cameraId,
                          api: provider.api,
                        ),
                        const SizedBox(height: 12),

                        // 3 & 4. TOMBOL SUDAH DITANGANI & ALARM PALSU
                        Row(
                          children: [
                            Expanded(
                              flex: 3,
                              child: SizedBox(
                                height: 50,
                                child: FilledButton.icon(
                                  onPressed: _updating || _event!.status == 'ditangani'
                                      ? null
                                      : () => _updateStatus('ditangani'),
                                  style: FilledButton.styleFrom(
                                    backgroundColor: AppColors.safe,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                  ),
                                  icon: const Icon(Icons.check_circle_outline, size: 20),
                                  label: const Text(
                                    'Sudah Ditangani',
                                    style: TextStyle(fontWeight: FontWeight.w700),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              flex: 2,
                              child: SizedBox(
                                height: 50,
                                child: OutlinedButton(
                                  onPressed: _updating || _event!.status == 'alarm_palsu'
                                      ? null
                                      : () => _updateStatus('alarm_palsu'),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: AppColors.textSecondary,
                                    side: const BorderSide(color: AppColors.borderStrong),
                                    backgroundColor: AppColors.surface,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                  ),
                                  child: const Text(
                                    'Alarm Palsu',
                                    style: TextStyle(fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
      ),
    );
  }
}

