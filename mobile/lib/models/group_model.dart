class CameraModel {
  final int id;
  final int groupId;
  final String namaRuangan;
  final String sumber;
  final String status;

  const CameraModel({
    required this.id,
    required this.groupId,
    required this.namaRuangan,
    required this.sumber,
    required this.status,
  });

  bool get isOnline => status.toLowerCase() == 'online';

  factory CameraModel.fromJson(Map<String, dynamic> json) {
    return CameraModel(
      id: (json['id'] as num).toInt(),
      groupId: (json['group_id'] as num).toInt(),
      namaRuangan: (json['nama_ruangan'] ?? '').toString(),
      sumber: (json['sumber'] ?? '0').toString(),
      status: (json['status'] ?? 'offline').toString(),
    );
  }

  CameraModel copyWith({String? status}) {
    return CameraModel(
      id: id,
      groupId: groupId,
      namaRuangan: namaRuangan,
      sumber: sumber,
      status: status ?? this.status,
    );
  }
}

class FamilyGroupModel {
  final int id;
  final String namaGrup;
  final String namaLansia;
  final String kodeUndangan;
  final String kontakDarurat;
  final int adminId;
  final List<CameraModel> cameras;

  const FamilyGroupModel({
    required this.id,
    required this.namaGrup,
    required this.namaLansia,
    required this.kodeUndangan,
    required this.kontakDarurat,
    required this.adminId,
    required this.cameras,
  });

  factory FamilyGroupModel.fromJson(Map<String, dynamic> json) {
    final rawCameras = (json['cameras'] as List<dynamic>? ?? []);
    return FamilyGroupModel(
      id: (json['id'] as num).toInt(),
      namaGrup: (json['nama_grup'] ?? '').toString(),
      namaLansia: (json['nama_lansia'] ?? '').toString(),
      kodeUndangan: (json['kode_undangan'] ?? '').toString(),
      kontakDarurat: (json['kontak_darurat'] ?? '').toString(),
      adminId: (json['admin_id'] as num).toInt(),
      cameras: rawCameras
          .map((e) => CameraModel.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
    );
  }

  FamilyGroupModel copyWith({List<CameraModel>? cameras}) {
    return FamilyGroupModel(
      id: id,
      namaGrup: namaGrup,
      namaLansia: namaLansia,
      kodeUndangan: kodeUndangan,
      kontakDarurat: kontakDarurat,
      adminId: adminId,
      cameras: cameras ?? this.cameras,
    );
  }
}

