import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../models/group_model.dart';
import '../services/api_service.dart';
import '../services/sigap_provider.dart';
import '../theme/app_colors.dart';
import '../utils/whatsapp_emergency.dart';

class FamilySettingsScreen extends StatefulWidget {
  final bool embeddedInTab;

  const FamilySettingsScreen({super.key, this.embeddedInTab = false});

  @override
  State<FamilySettingsScreen> createState() => _FamilySettingsScreenState();
}

class _FamilySettingsScreenState extends State<FamilySettingsScreen> {
  bool _showCode = false;
  final _newCameraCtrl = TextEditingController();
  final _newLokasiCctvCtrl = TextEditingController();

  @override
  void dispose() {
    _newCameraCtrl.dispose();
    _newLokasiCctvCtrl.dispose();
    super.dispose();
  }

  Future<void> _showEditCodeDialog(
    BuildContext context,
    SigapProvider provider,
    String currentCode,
  ) async {
    final ctrl = TextEditingController(text: currentCode);
    final updated = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Ubah Kode Kunci Keluarga'),
        content: TextField(
          controller: ctrl,
          maxLength: 12,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(
            labelText: 'Kode Keluarga Baru (4–12 huruf/angka)',
            hintText: 'Mis. KELUARGA88',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim().toUpperCase()),
            child: const Text('Simpan Kode'),
          ),
        ],
      ),
    );

    if (updated != null && updated.isNotEmpty && updated != currentCode) {
      try {
        await provider.updateFamilyGroup(kodeUndangan: updated);
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Kode Keluarga berhasil diubah ke $updated')),
        );
      } catch (e) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: AppColors.sos,
            content: Text(ApiService.extractError(e)),
          ),
        );
      }
    }
  }

  Future<void> _addCamera(SigapProvider provider) async {
    final room = _newCameraCtrl.text.trim();
    final lokasi = _newLokasiCctvCtrl.text.trim();
    if (room.length < 2) return;
    try {
      await provider.addRoomCamera(room, lokasiCctv: lokasi);
      _newCameraCtrl.clear();
      _newLokasiCctvCtrl.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Kamera "$room" beserta lokasi CCTV ditambahkan.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.sos,
          content: Text(ApiService.extractError(e)),
        ),
      );
    }
  }

  Future<void> _showEditCameraLocationDialog(
    BuildContext context,
    SigapProvider provider,
    CameraModel cam,
    String groupName,
  ) async {
    final roomCtrl = TextEditingController(text: cam.namaRuangan);
    final locCtrl = TextEditingController(
      text: cam.effectiveLokasiCctv(groupName),
    );
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Ubah Lokasi CCTV'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: roomCtrl,
              decoration: const InputDecoration(
                labelText: 'Nama Ruangan CCTV',
                hintText: 'Mis. Ruang Tamu / Kamar Tidur',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: locCtrl,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Alamat Lengkap / Link Google Maps CCTV',
                hintText: 'Mis. Jl. Melati No. 10 Lt. 1 (https://maps.google.com/?q=-6.2,106.8)',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Simpan Lokasi CCTV'),
          ),
        ],
      ),
    );

    if (saved == true) {
      try {
        await provider.updateRoomCamera(
          cameraId: cam.id,
          namaRuangan: roomCtrl.text.trim(),
          lokasiCctv: locCtrl.text.trim(),
        );
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Lokasi CCTV berhasil disimpan untuk pesan WA Darurat.'),
          ),
        );
      } catch (e) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: AppColors.sos,
            content: Text(ApiService.extractError(e)),
          ),
        );
      }
    }
  }

  Future<void> _showEditEmergencyPhoneDialog(
    BuildContext context,
    SigapProvider provider,
    String currentPhone,
  ) async {
    final ctrl = TextEditingController(text: currentPhone);
    final updated = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Ubah Nomor WA / Kontak Darurat'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            labelText: 'Nomor WhatsApp / Telepon Darurat',
            hintText: 'Mis. 081234567890',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('Simpan'),
          ),
        ],
      ),
    );

    if (updated != null && updated.length >= 5 && updated != currentPhone) {
      try {
        await provider.updateFamilyGroup(kontakDarurat: updated);
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Nomor WA Darurat diperbarui ke $updated')),
        );
      } catch (e) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: AppColors.sos,
            content: Text(ApiService.extractError(e)),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<SigapProvider>();
    final group = provider.activeGroup;
    if (group == null) return const SizedBox.shrink();

    final isOwner = provider.isCurrentGroupOwner;

    final listContent = ListView(
      padding: const EdgeInsets.all(16),
      children: [
          // 1. Kartu Kode Kunci Keluarga
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.vpn_key_rounded, color: AppColors.primary),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'Kode Kunci Akses Keluarga',
                          style: TextStyle(
                            fontSize: 15.5,
                            fontWeight: FontWeight.bold,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => setState(() => _showCode = !_showCode),
                        icon: Icon(
                          _showCode
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined,
                        ),
                        tooltip: _showCode ? 'Sembunyikan' : 'Tampilkan Kode',
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Bagikan kode ini hanya kepada anggota keluarga inti. Admin platform SaaS tidak dapat melihat kode maupun CCTV rumah Anda.',
                    style: TextStyle(fontSize: 12.5, color: AppColors.textSecondary),
                  ),
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
                    decoration: BoxDecoration(
                      color: AppColors.safeSoft,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.safeBorder),
                    ),
                    child: Center(
                      child: Text(
                        _showCode
                            ? group.kodeUndangan
                            : '•' * group.kodeUndangan.length,
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 6,
                          color: AppColors.safeText,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      OutlinedButton.icon(
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: group.kodeUndangan));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Kode Keluarga disalin ke papan klip.'),
                            ),
                          );
                        },
                        icon: const Icon(Icons.copy_rounded, size: 16),
                        label: const Text('Salin Kode'),
                      ),
                      if (isOwner)
                        OutlinedButton.icon(
                          onPressed: () => _showEditCodeDialog(
                            context,
                            provider,
                            group.kodeUndangan,
                          ),
                          icon: const Icon(Icons.edit_outlined, size: 16),
                          label: const Text('Ubah Kode'),
                        ),
                      FilledButton.icon(
                        onPressed: () {
                          provider.lockCurrentGroup();
                          Navigator.pop(context);
                        },
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                        ),
                        icon: const Icon(Icons.lock_outline_rounded, size: 16),
                        label: const Text('Kunci Akses Sekarang'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // 2. Manajemen Kamera Ruangan & Lokasi CCTV Keluarga
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          'Kamera Rumah & Lokasi CCTV (${group.cameras.length})',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ),
                      if (isOwner)
                        TextButton.icon(
                          onPressed: () => _showEditEmergencyPhoneDialog(
                            context,
                            provider,
                            group.kontakDarurat,
                          ),
                          icon: const Icon(Icons.phone_outlined, size: 16),
                          label: Text(
                            'WA: ${group.kontakDarurat}',
                            style: const TextStyle(fontSize: 12),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Lokasi tiap CCTV di bawah ini otomatis disertakan saat Anda menekan tombol Kirim Pesan WA Darurat.',
                    style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                  const SizedBox(height: 10),
                  ...group.cameras.map(
                    (cam) => Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceMuted,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                Icons.videocam_rounded,
                                color: cam.isOnline
                                    ? AppColors.safe
                                    : AppColors.textMuted,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  '${cam.namaRuangan} (CCTV #${cam.id})',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 14,
                                  ),
                                ),
                              ),
                              IconButton(
                                tooltip: 'Ubah Lokasi CCTV',
                                icon: const Icon(
                                  Icons.edit_location_alt_outlined,
                                  color: AppColors.primary,
                                  size: 20,
                                ),
                                onPressed: () => _showEditCameraLocationDialog(
                                  context,
                                  provider,
                                  cam,
                                  group.namaGrup,
                                ),
                              ),
                              IconButton(
                                tooltip: 'Kirim WA Darurat + Lokasi CCTV Ini',
                                icon: const Icon(
                                  Icons.chat_rounded,
                                  color: Color(0xFF15803D),
                                  size: 20,
                                ),
                                onPressed: () => WhatsAppEmergencyHelper
                                    .sendCameraEmergencyToWhatsApp(
                                  rawPhone: group.kontakDarurat,
                                  namaLansia: group.namaLansia,
                                  namaGrup: group.namaGrup,
                                  camera: cam,
                                ),
                              ),
                              IconButton(
                                tooltip: 'Hapus Kamera',
                                icon: const Icon(
                                  Icons.delete_outline_rounded,
                                  color: AppColors.sos,
                                  size: 20,
                                ),
                                onPressed: () =>
                                    provider.deleteRoomCamera(cam.id),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(
                                Icons.location_on_rounded,
                                size: 15,
                                color: AppColors.sos,
                              ),
                              const SizedBox(width: 5),
                              Expanded(
                                child: Text(
                                  'Lokasi CCTV: ${cam.effectiveLokasiCctv(group.namaGrup)}',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textSecondary,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const Divider(),
                  TextField(
                    controller: _newCameraCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Nama Ruangan Baru (mis. Kamar Tidur)',
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _newLokasiCctvCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Lokasi / Alamat / Link Maps CCTV',
                      hintText: 'Mis. Jl. Melati No. 10 (https://maps.google.com/...)',
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: 10),
                  FilledButton.icon(
                    onPressed:
                        provider.isLoading ? null : () => _addCamera(provider),
                    icon: const Icon(Icons.add_location_alt_outlined, size: 18),
                    label: const Text('Tambah Kamera & Lokasi CCTV'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // 3. Anggota Keluarga Terdaftar
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Anggota Keluarga (${group.members.length})',
                    style: const TextStyle(
                      fontSize: 15.5,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...group.members.map(
                    (m) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const CircleAvatar(
                        backgroundColor: AppColors.safeSoft,
                        child: Icon(Icons.person_outline, color: AppColors.primary),
                      ),
                      title: Text(
                        m.nama,
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      subtitle: Text(
                        m.userId == group.adminId
                            ? '${m.email} · Pembuat Grup'
                            : m.email,
                      ),
                      trailing: isOwner && m.userId != group.adminId
                          ? IconButton(
                              icon: const Icon(
                                Icons.person_remove_outlined,
                                color: AppColors.sos,
                              ),
                              onPressed: () =>
                                  provider.removeFamilyMember(m.userId),
                            )
                          : null,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      );

    if (widget.embeddedInTab) return listContent;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Privasi & Kode Keluarga'),
      ),
      body: listContent,
    );
  }
}

