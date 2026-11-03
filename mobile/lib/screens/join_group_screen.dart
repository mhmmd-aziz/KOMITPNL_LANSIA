import 'dart:math';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api_service.dart';
import '../services/sigap_provider.dart';
import '../theme/app_colors.dart';

class JoinGroupScreen extends StatefulWidget {
  final bool asDialogPage;

  const JoinGroupScreen({super.key, this.asDialogPage = false});

  @override
  State<JoinGroupScreen> createState() => _JoinGroupScreenState();
}

class _JoinGroupScreenState extends State<JoinGroupScreen> {
  bool _isCreateMode = false;

  // Form Gabung Kode Keluarga
  final _joinCodeCtrl = TextEditingController();

  // Form Buat Grup Keluarga Baru + Kode Keluarga Sendiri
  final _namaGrupCtrl = TextEditingController();
  final _namaLansiaCtrl = TextEditingController();
  final _kontakCtrl = TextEditingController(text: '+62 895-6006-86367');
  final _customCodeCtrl = TextEditingController();
  final _ruanganCtrl = TextEditingController(text: 'Ruang Tamu');

  String? _error;

  @override
  void dispose() {
    _joinCodeCtrl.dispose();
    _namaGrupCtrl.dispose();
    _namaLansiaCtrl.dispose();
    _kontakCtrl.dispose();
    _customCodeCtrl.dispose();
    _ruanganCtrl.dispose();
    super.dispose();
  }

  void _generateRandomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    final rnd = Random.secure();
    final generated = List.generate(6, (_) => chars[rnd.nextInt(chars.length)]).join();
    setState(() {
      _customCodeCtrl.text = generated;
    });
  }

  Future<void> _submitJoin() async {
    final code = _joinCodeCtrl.text.trim().toUpperCase();
    if (code.length < 4 || code.length > 12) {
      setState(() => _error = 'Masukkan Kode Keluarga 4–12 karakter.');
      return;
    }

    setState(() => _error = null);
    final provider = context.read<SigapProvider>();
    try {
      await provider.joinGroupByCode(code);
      if (!mounted) return;
      if (widget.asDialogPage && Navigator.canPop(context)) {
        Navigator.pop(context);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = ApiService.extractError(e));
    }
  }

  Future<void> _submitCreate() async {
    final namaGrup = _namaGrupCtrl.text.trim();
    final namaLansia = _namaLansiaCtrl.text.trim();
    final kontak = _kontakCtrl.text.trim();
    final customCode = _customCodeCtrl.text.trim().toUpperCase();
    final ruangan = _ruanganCtrl.text.trim();

    if (namaGrup.length < 2 || namaLansia.length < 2 || kontak.length < 5) {
      setState(() => _error = 'Lengkapi nama grup, nama lansia, dan nomor darurat.');
      return;
    }
    if (customCode.isEmpty || customCode.length < 4 || customCode.length > 12) {
      setState(
        () => _error = 'Buat Kode Kunci Keluarga Anda (4–12 huruf/angka tanpa spasi).',
      );
      return;
    }

    setState(() => _error = null);
    final provider = context.read<SigapProvider>();
    try {
      await provider.createFamilyGroup(
        namaGrup: namaGrup,
        namaLansia: namaLansia,
        kontakDarurat: kontak,
        kodeUndangan: customCode,
        namaRuanganAwal: ruangan.isEmpty ? 'Ruang Tamu' : ruangan,
      );
      if (!mounted) return;
      if (widget.asDialogPage && Navigator.canPop(context)) {
        Navigator.pop(context);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = ApiService.extractError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<SigapProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Akses Grup Keluarga'),
        actions: [
          if (!widget.asDialogPage)
            IconButton(
              onPressed: () => provider.logout(),
              tooltip: 'Keluar',
              icon: const Icon(Icons.logout),
            ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Tab Pilih Mode: Masuk Kode vs Buat Keluarga Baru
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: AppColors.background,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: GestureDetector(
                            onTap: () => setState(() {
                              _isCreateMode = false;
                              _error = null;
                            }),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              decoration: BoxDecoration(
                                color: !_isCreateMode
                                    ? AppColors.primary
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(9),
                              ),
                              child: Text(
                                'Punya Kode Keluarga',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.bold,
                                  color: !_isCreateMode
                                      ? Colors.white
                                      : AppColors.textSecondary,
                                ),
                              ),
                            ),
                          ),
                        ),
                        Expanded(
                          child: GestureDetector(
                            onTap: () => setState(() {
                              _isCreateMode = true;
                              _error = null;
                            }),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              decoration: BoxDecoration(
                                color: _isCreateMode
                                    ? AppColors.primary
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(9),
                              ),
                              child: Text(
                                'Buat Keluarga Baru',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.bold,
                                  color: _isCreateMode
                                      ? Colors.white
                                      : AppColors.textSecondary,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  if (_error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.dangerSoft,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.dangerBorder),
                      ),
                      child: Text(
                        _error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: AppColors.dangerText,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                  ],

                  if (!_isCreateMode) ...[
                    const Icon(
                      Icons.lock_person_rounded,
                      size: 46,
                      color: AppColors.primary,
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Buka Akses dengan Kode Keluarga',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Masukkan Kode Keluarga yang dibuat oleh keluarga Anda. Data CCTV & riwayat hanya dapat dilihat oleh pemegang kode ini.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 20),
                    TextField(
                      controller: _joinCodeCtrl,
                      maxLength: 12,
                      textCapitalization: TextCapitalization.characters,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 4,
                      ),
                      decoration: const InputDecoration(
                        hintText: 'EYANG1',
                        counterText: '',
                      ),
                    ),
                    const SizedBox(height: 18),
                    SizedBox(
                      height: 48,
                      child: FilledButton.icon(
                        onPressed: provider.isLoading ? null : _submitJoin,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                        ),
                        icon: const Icon(Icons.key_rounded, size: 18),
                        label: Text(
                          provider.isLoading
                              ? 'Memverifikasi...'
                              : 'Buka & Gabung Keluarga',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ] else ...[
                    const Icon(
                      Icons.shield_rounded,
                      size: 42,
                      color: AppColors.primary,
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Buat Grup Keluarga & Kode Kunci',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Keluarga Anda dikunci secara privat dengan kode buatan Anda sendiri (Admin platform pun tidak dapat melihat CCTV rumah Anda).',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12.5,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 18),
                    TextField(
                      controller: _namaGrupCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Nama Rumah / Grup Keluarga',
                        hintText: 'Mis. Rumah Eyang Sri',
                        prefixIcon: Icon(Icons.home_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _namaLansiaCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Nama Lansia yang Dipantau',
                        hintText: 'Mis. Eyang Sri',
                        prefixIcon: Icon(Icons.elderly_rounded),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _kontakCtrl,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'Nomor Telepon Darurat (SOS)',
                        hintText: 'Mis. 081234567890',
                        prefixIcon: Icon(Icons.phone_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _customCodeCtrl,
                            maxLength: 12,
                            textCapitalization: TextCapitalization.characters,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              letterSpacing: 2,
                            ),
                            decoration: const InputDecoration(
                              labelText: 'Buat Kode Kunci Keluarga',
                              hintText: 'Mis. SRIKU88',
                              counterText: '',
                              prefixIcon: Icon(Icons.vpn_key_outlined),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: _generateRandomCode,
                          child: const Text('Acak'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _ruanganCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Nama Ruangan Kamera Pertama',
                        hintText: 'Mis. Ruang Tamu',
                        prefixIcon: Icon(Icons.videocam_outlined),
                      ),
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      height: 48,
                      child: FilledButton.icon(
                        onPressed: provider.isLoading ? null : _submitCreate,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                        ),
                        icon: const Icon(Icons.lock_outline_rounded, size: 18),
                        label: Text(
                          provider.isLoading
                              ? 'Menyimpan...'
                              : 'Buat & Kunci Grup Keluarga',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
