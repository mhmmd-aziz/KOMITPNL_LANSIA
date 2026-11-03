class CameraModel {
  final int id;
  final int groupId;
  final String namaRuangan;
  final String lokasiCctv;
  final String sumber;
  final String status;

  const CameraModel({
    required this.id,
    required this.groupId,
    required this.namaRuangan,
    this.lokasiCctv = '',
    required this.sumber,
    required this.status,
  });

  bool get isOnline => status.toLowerCase() == 'online';

  String effectiveLokasiCctv([String groupName = '']) {
    if (lokasiCctv.trim().isNotEmpty) return lokasiCctv.trim();
    if (groupName.trim().isNotEmpty) return '$namaRuangan, $groupName';
    return namaRuangan;
  }

  factory CameraModel.fromJson(Map<String, dynamic> json) {
    return CameraModel(
      id: (json['id'] as num).toInt(),
      groupId: (json['group_id'] as num).toInt(),
      namaRuangan: (json['nama_ruangan'] ?? '').toString(),
      lokasiCctv: (json['lokasi_cctv'] ?? '').toString(),
      sumber: (json['sumber'] ?? 'idle').toString(),
      status: (json['status'] ?? 'offline').toString(),
    );
  }

  CameraModel copyWith({
    String? namaRuangan,
    String? lokasiCctv,
    String? status,
    String? sumber,
  }) {
    return CameraModel(
      id: id,
      groupId: groupId,
      namaRuangan: namaRuangan ?? this.namaRuangan,
      lokasiCctv: lokasiCctv ?? this.lokasiCctv,
      sumber: sumber ?? this.sumber,
      status: status ?? this.status,
    );
  }
}

class GroupMemberModel {
  final int userId;
  final String nama;
  final String email;
  final String role;

  const GroupMemberModel({
    required this.userId,
    required this.nama,
    required this.email,
    required this.role,
  });

  factory GroupMemberModel.fromJson(Map<String, dynamic> json) {
    return GroupMemberModel(
      userId: (json['user_id'] as num).toInt(),
      nama: (json['nama'] ?? '').toString(),
      email: (json['email'] ?? '').toString(),
      role: (json['role'] ?? 'keluarga').toString(),
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
  final List<GroupMemberModel> members;

  const FamilyGroupModel({
    required this.id,
    required this.namaGrup,
    required this.namaLansia,
    required this.kodeUndangan,
    required this.kontakDarurat,
    required this.adminId,
    required this.cameras,
    this.members = const [],
  });

  factory FamilyGroupModel.fromJson(Map<String, dynamic> json) {
    final rawCameras = (json['cameras'] as List<dynamic>? ?? []);
    final rawMembers = (json['members'] as List<dynamic>? ?? []);
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
      members: rawMembers
          .map((e) => GroupMemberModel.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
    );
  }

  FamilyGroupModel copyWith({
    List<CameraModel>? cameras,
    List<GroupMemberModel>? members,
    String? kodeUndangan,
    String? namaGrup,
    String? namaLansia,
    String? kontakDarurat,
  }) {
    return FamilyGroupModel(
      id: id,
      namaGrup: namaGrup ?? this.namaGrup,
      namaLansia: namaLansia ?? this.namaLansia,
      kodeUndangan: kodeUndangan ?? this.kodeUndangan,
      kontakDarurat: kontakDarurat ?? this.kontakDarurat,
      adminId: adminId,
      cameras: cameras ?? this.cameras,
      members: members ?? this.members,
    );
  }
}
