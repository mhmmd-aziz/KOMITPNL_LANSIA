import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:video_player/video_player.dart';

import '../models/group_model.dart';
import '../services/api_service.dart';
import '../services/sigap_provider.dart';
import '../theme/app_colors.dart';
import '../widgets/mjpeg_stream_view.dart';

class SafeZoneLabScreen extends StatefulWidget {
  final bool embeddedInTab;

  const SafeZoneLabScreen({super.key, this.embeddedInTab = false});

  @override
  State<SafeZoneLabScreen> createState() => _SafeZoneLabScreenState();
}

class _SafeZoneLabScreenState extends State<SafeZoneLabScreen> {
  final ImagePicker _picker = ImagePicker();

  int? _selectedCameraId;
  List<Map<String, dynamic>> _videos = <Map<String, dynamic>>[];
  String _selectedVideo = '';

  VideoPlayerController? _previewController;
  bool _loadingVideos = false;
  bool _loadingFrame = false;
  bool _uploadingVideo = false;
  bool _runningAction = false;

  // Mode tampilan: 'calibrate' (Frame ke-1 + Tap 4 Titik) | 'stream' (Live Analisis AI)
  String _previewMode = 'calibrate';
  String _streamNonce = '';
  Map<String, dynamic>? _telemetry;
  Timer? _telemetryTimer;

  // Poligon Area Aman tersimpan: [[[x,y],[x,y],[x,y],[x,y]], ...]
  List<List<List<double>>> _savedZones = <List<List<double>>>[];
  List<List<double>> _draftPoints = <List<double>>[];
  bool _drawingMode = false;
  bool _zonesConfirmed = false;

  String? _statusMsg;
  String? _errorMsg;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initializeForGroup();
    });
  }

  @override
  void dispose() {
    _telemetryTimer?.cancel();
    _previewController?.dispose();
    super.dispose();
  }

  Future<void> _initializeForGroup() async {
    final provider = context.read<SigapProvider>();
    final cams = provider.activeGroup?.cameras ?? <CameraModel>[];
    if (cams.isEmpty) return;

    final camId = _selectedCameraId != null && cams.any((c) => c.id == _selectedCameraId)
        ? _selectedCameraId!
        : cams.first.id;
    await _selectCamera(camId);
  }

  Future<void> _selectCamera(int camId) async {
    setState(() {
      _selectedCameraId = camId;
      _loadingVideos = true;
      _errorMsg = null;
      _statusMsg = null;
      _previewMode = 'calibrate';
    });

    _startTelemetryPolling(camId);

    final provider = context.read<SigapProvider>();
    try {
      final vids = await provider.api.getSimulationVideos(cameraId: camId);
      if (!mounted) return;
      setState(() {
        _videos = vids;
        _loadingVideos = false;
      });

      final camObj = provider.activeGroup?.cameras
          .where((c) => c.id == camId)
          .firstOrNull;

      Map<String, dynamic>? preferred;
      if (camObj != null) {
        for (final v in vids) {
          if (v['name']?.toString() == camObj.sumber) {
            preferred = v;
            break;
          }
        }
      }
      preferred ??= vids.isNotEmpty ? vids.first : null;

      if (preferred != null && preferred['name'] != null) {
        await _selectAndPrepareVideo(preferred['name'].toString(), camId);
      } else {
        setState(() {
          _selectedVideo = '';
          _savedZones = <List<List<double>>>[];
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingVideos = false;
        _errorMsg = ApiService.extractError(e);
      });
    }
  }

  void _startTelemetryPolling(int camId) {
    _telemetryTimer?.cancel();
    _telemetryTimer = Timer.periodic(const Duration(milliseconds: 900), (_) async {
      if (!mounted || _previewMode != 'stream') return;
      try {
        final provider = context.read<SigapProvider>();
        final res = await provider.api.getSimulationTelemetry(cameraId: camId);
        if (!mounted) return;
        final tel = res['telemetry'];
        if (tel is Map) {
          setState(() {
            _telemetry = Map<String, dynamic>.from(tel);
          });
        }
      } catch (_) {}
    });
  }

  Future<void> _selectAndPrepareVideo(String videoName, int camId) async {
    final provider = context.read<SigapProvider>();
    setState(() {
      _selectedVideo = videoName;
      _previewMode = 'calibrate';
      _loadingFrame = true;
      _draftPoints = <List<double>>[];
      _errorMsg = null;
    });

    // Muat Frame ke-1 video secara mute di layar HP
    final oldCtrl = _previewController;
    _previewController = null;
    await oldCtrl?.dispose();

    final videoUrl = provider.api.getSimulationVideoFileUrl(
      videoName,
      camId,
      rev: DateTime.now().millisecondsSinceEpoch.toString(),
    );

    final ctrl = VideoPlayerController.networkUrl(
      Uri.parse(videoUrl),
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
    );

    try {
      final zonesFuture = provider.api.prepareSimulationVideo(
        cameraId: camId,
        videoName: videoName,
      );
      await ctrl.initialize();
      await ctrl.setVolume(0.0);
      await ctrl.seekTo(const Duration(milliseconds: 80));
      await ctrl.pause();
      final loadedZones = await zonesFuture;

      if (!mounted) {
        await ctrl.dispose();
        return;
      }

      setState(() {
        _previewController = ctrl;
        _loadingFrame = false;
        _savedZones = loadedZones;
        if (loadedZones.isNotEmpty) {
          _zonesConfirmed = true;
          _drawingMode = false;
        } else {
          _zonesConfirmed = false;
          _drawingMode = true;
        }
      });
    } catch (e) {
      await ctrl.dispose();
      if (!mounted) return;
      setState(() {
        _loadingFrame = false;
        _errorMsg = ApiService.extractError(e);
      });
    }
  }

  Future<void> _pickAndUploadFromPhone() async {
    final camId = _selectedCameraId;
    if (camId == null || _uploadingVideo) return;

    try {
      final picked = await _picker.pickVideo(source: ImageSource.gallery);
      if (picked == null || !mounted) return;

      setState(() {
        _uploadingVideo = true;
        _errorMsg = null;
        _statusMsg = null;
      });

      final provider = context.read<SigapProvider>();
      final res = await provider.api.uploadSimulationVideo(
        cameraId: camId,
        videoFile: File(picked.path),
      );

      await provider.refreshGroupsAndEvents();
      if (!mounted) return;

      final rawVids = (res['videos'] as List<dynamic>?) ?? <dynamic>[];
      final updatedVids =
          rawVids.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      final uploadedName = res['uploaded']?.toString() ?? '';

      setState(() {
        _videos = updatedVids;
        _uploadingVideo = false;
        _statusMsg =
            res['message']?.toString() ?? 'Video ruangan berhasil diunggah!';
      });

      if (uploadedName.isNotEmpty) {
        await _selectAndPrepareVideo(uploadedName, camId);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _uploadingVideo = false;
        _errorMsg = ApiService.extractError(e);
      });
    }
  }

  void _handleTapOnFrame(TapDownDetails details, Size boxSize) {
    if (_previewMode != 'calibrate' ||
        !_drawingMode ||
        _selectedCameraId == null ||
        _selectedVideo.isEmpty ||
        boxSize.width <= 0 ||
        boxSize.height <= 0) {
      return;
    }

    final nx = (details.localPosition.dx / boxSize.width).clamp(0.0, 1.0);
    final ny = (details.localPosition.dy / boxSize.height).clamp(0.0, 1.0);
    final roundedPt = <double>[
      double.parse(nx.toStringAsFixed(4)),
      double.parse(ny.toStringAsFixed(4)),
    ];

    final nextDraft = <List<double>>[..._draftPoints, roundedPt];
    if (nextDraft.length == 4) {
      final updatedZones = <List<List<double>>>[..._savedZones, nextDraft];
      setState(() {
        _draftPoints = <List<double>>[];
        _drawingMode = false;
        _zonesConfirmed = true;
        _savedZones = updatedZones;
      });
      _persistZones(
        updatedZones,
        'Area Aman #${updatedZones.length} tersimpan otomatis untuk CCTV ini!',
      );
    } else {
      setState(() => _draftPoints = nextDraft);
    }
  }

  Future<void> _persistZones(
    List<List<List<double>>> nextZones,
    String successText,
  ) async {
    final camId = _selectedCameraId;
    if (camId == null || _selectedVideo.isEmpty) return;

    final provider = context.read<SigapProvider>();
    try {
      final saved = await provider.api.saveSimulationZones(
        cameraId: camId,
        videoName: _selectedVideo,
        zones: nextZones,
      );
      if (!mounted) return;
      setState(() {
        _savedZones = saved;
        _statusMsg = successText;
        _errorMsg = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMsg = ApiService.extractError(e));
    }
  }

  Future<void> _startAiAnalysis() async {
    final camId = _selectedCameraId;
    if (camId == null || _selectedVideo.isEmpty || _runningAction) return;

    setState(() {
      _runningAction = true;
      _errorMsg = null;
      _statusMsg = null;
    });

    final provider = context.read<SigapProvider>();
    try {
      final msg = await provider.api.runSimulationOnce(
        cameraId: camId,
        videoName: _selectedVideo,
        zones: _savedZones,
      );
      if (!mounted) return;
      setState(() {
        _runningAction = false;
        _streamNonce = DateTime.now().millisecondsSinceEpoch.toString();
        _previewMode = 'stream';
        _statusMsg = msg;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _runningAction = false;
        _errorMsg = ApiService.extractError(e);
      });
    }
  }

  Future<void> _stopAiAnalysis() async {
    final camId = _selectedCameraId;
    if (camId == null) return;
    final provider = context.read<SigapProvider>();
    try {
      await provider.api.stopSimulation(cameraId: camId);
      if (!mounted) return;
      setState(() {
        _previewMode = 'calibrate';
        _statusMsg = 'Analisis dihentikan. Kembali ke kalibrasi Area Aman.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMsg = ApiService.extractError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<SigapProvider>();
    final group = provider.activeGroup;
    final cameras = group?.cameras ?? <CameraModel>[];

    if (cameras.isEmpty) {
      final emptyBody = const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Belum ada kamera terdaftar di grup keluarga Anda. Tambahkan kamera ruangan pada tab Keluarga terlebih dahulu.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textSecondary),
          ),
        ),
      );
      if (widget.embeddedInTab) return emptyBody;
      return Scaffold(
        appBar: AppBar(title: const Text('Area Aman & Uji POV')),
        body: emptyBody,
      );
    }

    final activeCam = cameras.firstWhere(
      (c) => c.id == _selectedCameraId,
      orElse: () => cameras.first,
    );

    final isRunning =
        _previewMode == 'stream' && (_telemetry?['running'] == true);
    final canStart = _selectedVideo.isNotEmpty &&
        !_drawingMode &&
        _zonesConfirmed &&
        !isRunning;

    final content = ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Info Isolasi Privasi Grup
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.primarySoft,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.primaryBorder),
          ),
          child: Row(
            children: [
              const Icon(Icons.shield_outlined, color: AppColors.primary, size: 26),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Atur 4 Titik Area Aman (Sofa/Kasur) & unggah video POV ruangan khusus milik ${group?.namaGrup ?? "keluarga Anda"}.',
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),

        if (_errorMsg != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.dangerSoft,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.dangerBorder),
            ),
            child: Text(
              _errorMsg!,
              style: const TextStyle(
                color: AppColors.dangerText,
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],

        if (_statusMsg != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.safeSoft,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.safeBorder),
            ),
            child: Text(
              _statusMsg!,
              style: const TextStyle(
                color: AppColors.safeText,
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],

        // 1. Pilih CCTV Ruangan Milik Keluarga Sendiri
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  '1. Pilih CCTV Ruangan Keluarga Anda',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<int>(
                  initialValue: activeCam.id,
                  decoration: const InputDecoration(
                    isDense: true,
                    prefixIcon: Icon(Icons.videocam_outlined),
                  ),
                  items: cameras
                      .map(
                        (c) => DropdownMenuItem<int>(
                          value: c.id,
                          child: Text('${c.namaRuangan} (CCTV #${c.id})'),
                        ),
                      )
                      .toList(),
                  onChanged: isRunning
                      ? null
                      : (val) {
                          if (val != null) _selectCamera(val);
                        },
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Expanded(
                      child: Text(
                        'Video POV Ruangan:',
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.bold,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: (_uploadingVideo || isRunning)
                          ? null
                          : _pickAndUploadFromPhone,
                      icon: _uploadingVideo
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.upload_file_rounded, size: 17),
                      label: Text(
                        _uploadingVideo ? 'Mengunggah...' : 'Upload dari HP',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (_loadingVideos)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (_videos.isEmpty)
                  const Text(
                    'Belum ada video simulasi. Ketuk Upload dari HP di atas.',
                    style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _videos.map((v) {
                      final vName = v['name']?.toString() ?? '';
                      final isOwned = v['is_owned'] == true;
                      final selected = vName == _selectedVideo;
                      return ChoiceChip(
                        selected: selected,
                        label: Text(
                          isOwned ? '★ $vName (Milik Anda)' : vName,
                          style: const TextStyle(fontSize: 12),
                        ),
                        onSelected: isRunning
                            ? null
                            : (_) => _selectAndPrepareVideo(vName, activeCam.id),
                      );
                    }).toList(),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),

        // 2. Layar Interaktif Ketuk 4 Titik Area Aman
        Card(
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                color: AppColors.videoFrame,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        _previewMode == 'calibrate' && _drawingMode
                            ? 'Ketuk Sudut ke-${_draftPoints.length + 1}/4 di Gambar'
                            : 'Ruangan: ${activeCam.namaRuangan} (${_savedZones.length} Area Aman)',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 12.5,
                        ),
                      ),
                    ),
                    if (_previewMode == 'stream' && !isRunning)
                      TextButton(
                        onPressed: () => setState(() => _previewMode = 'calibrate'),
                        child: const Text(
                          'Ubah Area Aman',
                          style: TextStyle(color: Colors.tealAccent, fontSize: 12),
                        ),
                      ),
                  ],
                ),
              ),

              if (_previewMode == 'calibrate')
                Container(
                  color: AppColors.videoFrame,
                  child: _loadingFrame
                      ? const AspectRatio(
                          aspectRatio: 16 / 9,
                          child: Center(
                            child: CircularProgressIndicator(color: Colors.white),
                          ),
                        )
                      : (_previewController != null &&
                              _previewController!.value.isInitialized)
                          ? AspectRatio(
                              aspectRatio:
                                  _previewController!.value.aspectRatio > 0
                                      ? _previewController!.value.aspectRatio
                                      : (16 / 9),
                              child: LayoutBuilder(
                                builder: (ctx, constraints) {
                                  final boxSize = Size(
                                    constraints.maxWidth,
                                    constraints.maxHeight,
                                  );
                                  return GestureDetector(
                                    behavior: HitTestBehavior.opaque,
                                    onTapDown: (d) => _handleTapOnFrame(d, boxSize),
                                    child: Stack(
                                      fit: StackFit.expand,
                                      children: [
                                        VideoPlayer(_previewController!),
                                        CustomPaint(
                                          painter: _SafeZoneOverlayPainter(
                                            savedZones: _savedZones,
                                            draftPoints: _draftPoints,
                                          ),
                                        ),
                                      ],
                                    ),
                                  );
                                },
                              ),
                            )
                          : const AspectRatio(
                              aspectRatio: 16 / 9,
                              child: Center(
                                child: Text(
                                  'Pilih atau unggah video ruangan terlebih dahulu',
                                  style: TextStyle(color: Colors.white70, fontSize: 12.5),
                                ),
                              ),
                            ),
                )
              else
                MjpegStreamView(
                  streamUrl: provider.api.getSimulationStreamUrl(
                    activeCam.id,
                    nonce: _streamNonce,
                  ),
                ),

              // Kontrol Tombol Area Aman (Langkah 2)
              Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      '2. Tandai 4 Sudut Area Aman (Sofa / Kasur)',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 13.5,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (!_drawingMode)
                          FilledButton.icon(
                            onPressed: isRunning
                                ? null
                                : () {
                                    setState(() {
                                      _previewMode = 'calibrate';
                                      _drawingMode = true;
                                      _draftPoints = <List<double>>[];
                                      _zonesConfirmed = false;
                                    });
                                  },
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.warning,
                            ),
                            icon: const Icon(Icons.touch_app_rounded, size: 17),
                            label: Text(
                              _savedZones.isNotEmpty
                                  ? '+ Tambah Area Aman'
                                  : '+ Tandai 4 Titik di Gambar',
                            ),
                          )
                        else ...[
                          OutlinedButton.icon(
                            onPressed: _draftPoints.isEmpty
                                ? null
                                : () {
                                    setState(() {
                                      _draftPoints = _draftPoints.sublist(
                                        0,
                                        _draftPoints.length - 1,
                                      );
                                    });
                                  },
                            icon: const Icon(Icons.undo_rounded, size: 17),
                            label: Text('Undo (${_draftPoints.length}/4)'),
                          ),
                          TextButton(
                            onPressed: () {
                              setState(() {
                                _drawingMode = false;
                                _draftPoints = <List<double>>[];
                                if (_savedZones.isNotEmpty) {
                                  _zonesConfirmed = true;
                                }
                              });
                            },
                            child: const Text('Batal'),
                          ),
                        ],
                        if (_savedZones.isNotEmpty && !_drawingMode)
                          OutlinedButton.icon(
                            onPressed: isRunning
                                ? null
                                : () {
                                    setState(() {
                                      _previewMode = 'calibrate';
                                      _drawingMode = true;
                                      _draftPoints = <List<double>>[];
                                      _zonesConfirmed = false;
                                      _savedZones = <List<List<double>>>[];
                                    });
                                    _persistZones(
                                      <List<List<double>>>[],
                                      'Seluruh Area Aman pada video ini telah direset.',
                                    );
                                  },
                            icon: const Icon(Icons.delete_outline, size: 17),
                            label: const Text('Reset Area'),
                          ),
                        if (_savedZones.isEmpty && !_zonesConfirmed)
                          OutlinedButton.icon(
                            onPressed: () {
                              setState(() {
                                _drawingMode = false;
                                _draftPoints = <List<double>>[];
                                _zonesConfirmed = true;
                              });
                            },
                            icon: const Icon(Icons.check_rounded, size: 17),
                            label: const Text('Tanpa Sofa/Kasur'),
                          ),
                      ],
                    ),
                    const SizedBox(height: 14),

                    // Langkah 3: Mulai Uji Analisis AI 1x
                    Row(
                      children: [
                        Expanded(
                          child: SizedBox(
                            height: 48,
                            child: FilledButton.icon(
                              onPressed: (!canStart || _runningAction)
                                  ? null
                                  : _startAiAnalysis,
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.primary,
                              ),
                              icon: const Icon(Icons.play_arrow_rounded),
                              label: Text(
                                _runningAction
                                    ? 'Menyiapkan Engine AI...'
                                    : isRunning
                                        ? 'Analisis AI Berjalan...'
                                        : '3. Mulai Analisis AI (Putar 1x)',
                                style: const TextStyle(fontWeight: FontWeight.bold),
                              ),
                            ),
                          ),
                        ),
                        if (isRunning) ...[
                          const SizedBox(width: 8),
                          SizedBox(
                            height: 48,
                            child: FilledButton(
                              onPressed: _stopAiAnalysis,
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.sos,
                              ),
                              child: const Text('Stop'),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );

    if (widget.embeddedInTab) return content;

    return Scaffold(
      appBar: AppBar(title: const Text('Kalibrasi Area Aman & POV')),
      body: content,
    );
  }
}

class _SafeZoneOverlayPainter extends CustomPainter {
  final List<List<List<double>>> savedZones;
  final List<List<double>> draftPoints;

  _SafeZoneOverlayPainter({
    required this.savedZones,
    required this.draftPoints,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final fillSaved = Paint()
      ..color = const Color(0x4410B981)
      ..style = PaintingStyle.fill;
    final strokeSaved = Paint()
      ..color = const Color(0xFF10B981)
      ..strokeWidth = 2.8
      ..style = PaintingStyle.stroke;

    for (var zIdx = 0; zIdx < savedZones.length; zIdx++) {
      final poly = savedZones[zIdx];
      if (poly.length < 3) continue;
      final path = Path();
      for (var i = 0; i < poly.length; i++) {
        final dx = poly[i][0] * size.width;
        final dy = poly[i][1] * size.height;
        if (i == 0) {
          path.moveTo(dx, dy);
        } else {
          path.lineTo(dx, dy);
        }
      }
      path.close();
      canvas.drawPath(path, fillSaved);
      canvas.drawPath(path, strokeSaved);

      for (var pIdx = 0; pIdx < poly.length; pIdx++) {
        final ptOffset = Offset(poly[pIdx][0] * size.width, poly[pIdx][1] * size.height);
        _drawNumberedPin(
          canvas,
          ptOffset,
          '${pIdx + 1}',
          const Color(0xFF047857),
          Colors.white,
        );
      }

      // Label AREA AMAN #N
      final topX = poly.map((p) => p[0] * size.width).reduce((a, b) => a < b ? a : b);
      final topY = poly.map((p) => p[1] * size.height).reduce((a, b) => a < b ? a : b);
      final labelPainter = TextPainter(
        text: TextSpan(
          text: ' AREA AMAN #${zIdx + 1} ',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.w800,
            backgroundColor: Color(0xFF047857),
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      labelPainter.paint(
        canvas,
        Offset(
          topX.clamp(6.0, (size.width - labelPainter.width - 6).clamp(6.0, size.width)),
          (topY - 20).clamp(6.0, size.height - 20),
        ),
      );
    }

    // Titik draft kuning saat sedang mengetuk 1..3
    if (draftPoints.isNotEmpty) {
      if (draftPoints.length >= 2) {
        final draftStroke = Paint()
          ..color = const Color(0xFFF59E0B)
          ..strokeWidth = 2.6
          ..style = PaintingStyle.stroke;
        final dPath = Path();
        for (var i = 0; i < draftPoints.length; i++) {
          final dx = draftPoints[i][0] * size.width;
          final dy = draftPoints[i][1] * size.height;
          if (i == 0) {
            dPath.moveTo(dx, dy);
          } else {
            dPath.lineTo(dx, dy);
          }
        }
        canvas.drawPath(dPath, draftStroke);
      }

      for (var i = 0; i < draftPoints.length; i++) {
        final ptOffset = Offset(
          draftPoints[i][0] * size.width,
          draftPoints[i][1] * size.height,
        );
        _drawNumberedPin(
          canvas,
          ptOffset,
          '${i + 1}',
          const Color(0xFFF59E0B),
          const Color(0xFF0F172A),
        );
      }
    }
  }

  void _drawNumberedPin(
    Canvas canvas,
    Offset center,
    String text,
    Color fillColor,
    Color textColor,
  ) {
    canvas.drawCircle(center, 11, Paint()..color = Colors.white);
    canvas.drawCircle(center, 9.5, Paint()..color = fillColor);
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: textColor,
          fontSize: 10.5,
          fontWeight: FontWeight.w900,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(center.dx - tp.width / 2, center.dy - tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant _SafeZoneOverlayPainter oldDelegate) {
    return oldDelegate.savedZones != savedZones ||
        oldDelegate.draftPoints != draftPoints;
  }
}
