import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api_service.dart';
import '../services/sigap_provider.dart';
import '../theme/app_colors.dart';
import 'join_group_screen.dart';

class FamilyLockScreen extends StatefulWidget {
  const FamilyLockScreen({super.key});

  @override
  State<FamilyLockScreen> createState() => _FamilyLockScreenState();
}

class _FamilyLockScreenState extends State<FamilyLockScreen> {
  final _codeCtrl = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _unlock() async {
    final code = _codeCtrl.text.trim().toUpperCase();
    if (code.length < 4) {
      setState(() => _error = 'Masukkan Kode Keluarga minimal 4 karakter.');
      return;
    }

    setState(() => _error = null);
    final provider = context.read<SigapProvider>();
    try {
      await provider.unlockCurrentGroupWithCode(code);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = ApiService.extractError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<SigapProvider>();
    final group = provider.activeGroup;
    if (group == null) return const SizedBox.shrink();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Akses Keluarga Terkunci'),
        actions: [
          if (provider.groups.length > 1)
            PopupMenuButton<int>(
              tooltip: 'Ganti Grup',
              icon: const Icon(Icons.swap_horiz_rounded),
              onSelected: (id) => provider.selectGroup(id),
              itemBuilder: (_) => provider.groups
                  .map(
                    (g) => PopupMenuItem<int>(
                      value: g.id,
                      child: Text(g.namaGrup),
                    ),
                  )
                  .toList(),
            ),
          IconButton(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const JoinGroupScreen(asDialogPage: true),
                ),
              );
            },
            tooltip: 'Buat / Gabung Grup Baru',
            icon: const Icon(Icons.group_add_outlined),
          ),
          IconButton(
            onPressed: () => provider.logout(),
            tooltip: 'Keluar',
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      width: 64,
                      height: 64,
                      decoration: const BoxDecoration(
                        color: AppColors.safeSoft,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.lock_rounded,
                        color: AppColors.primary,
                        size: 32,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      group.namaGrup,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Tayangan CCTV & data lansia keluarga ini dikunci secara privat. Masukkan Kode Keluarga Anda untuk membuka pantauan.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.textSecondary,
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
                    TextField(
                      controller: _codeCtrl,
                      maxLength: 12,
                      textCapitalization: TextCapitalization.characters,
                      textAlign: TextAlign.center,
                      onSubmitted: (_) => _unlock(),
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 5,
                      ),
                      decoration: const InputDecoration(
                        hintText: 'KODE KELUARGA',
                        counterText: '',
                      ),
                    ),
                    const SizedBox(height: 18),
                    SizedBox(
                      height: 48,
                      child: FilledButton.icon(
                        onPressed: provider.isLoading ? null : _unlock,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                        ),
                        icon: const Icon(Icons.lock_open_rounded, size: 18),
                        label: Text(
                          provider.isLoading
                              ? 'Memeriksa Kode...'
                              : 'Buka dengan Kode Keluarga',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextButton.icon(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const JoinGroupScreen(asDialogPage: true),
                          ),
                        );
                      },
                      icon: const Icon(Icons.add_moderator_outlined, size: 17),
                      label: const Text('Buat Grup Keluarga Baru Sendiri'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

