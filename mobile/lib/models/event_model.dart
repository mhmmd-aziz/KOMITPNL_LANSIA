class FallEventModel {
  final int id;
  final int cameraId;
  final String cameraName;
  final String lokasiCctv;
  final int groupId;
  final String namaGrup;
  final String namaLansia;
  final String kontakDarurat;
  final String waktu;
  final String snapshotPath;
  final String snapshotUrl;
  final double confidence;
  final String status;
  final int? handledBy;
  final String? handledByName;

  const FallEventModel({
    required this.id,
    required this.cameraId,
    required this.cameraName,
    this.lokasiCctv = '',
    required this.groupId,
    required this.namaGrup,
    required this.namaLansia,
    required this.kontakDarurat,
    required this.waktu,
    required this.snapshotPath,
    required this.snapshotUrl,
    required this.confidence,
    required this.status,
    this.handledBy,
    this.handledByName,
  });

  bool get isUnhandled => status == 'baru';

  String get effectiveLokasiCctv {
    if (lokasiCctv.trim().isNotEmpty) return lokasiCctv.trim();
    if (namaGrup.trim().isNotEmpty) return '$cameraName, $namaGrup';
    return cameraName;
  }

  factory FallEventModel.fromJson(Map<String, dynamic> json) {
    return FallEventModel(
      id: (json['id'] as num).toInt(),
      cameraId: (json['camera_id'] as num).toInt(),
      cameraName: (json['camera_name'] ?? 'Ruangan').toString(),
      lokasiCctv: (json['lokasi_cctv'] ?? '').toString(),
      groupId: (json['group_id'] as num).toInt(),
      namaGrup: (json['nama_grup'] ?? '').toString(),
      namaLansia: (json['nama_lansia'] ?? 'Lansia').toString(),
      kontakDarurat: (json['kontak_darurat'] ?? '').toString(),
      waktu: (json['waktu'] ?? '').toString(),
      snapshotPath: (json['snapshot_path'] ?? '').toString(),
      snapshotUrl: (json['snapshot_url'] ?? '').toString(),
      confidence: (json['confidence'] as num? ?? 0.0).toDouble(),
      status: (json['status'] ?? 'baru').toString(),
      handledBy: json['handled_by'] != null ? (json['handled_by'] as num).toInt() : null,
      handledByName: json['handled_by_name']?.toString(),
    );
  }
}

