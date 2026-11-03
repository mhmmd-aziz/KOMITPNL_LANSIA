import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/event_model.dart';
import '../services/sigap_provider.dart';
import '../theme/app_colors.dart';
import '../widgets/status_badge.dart';
import 'event_detail_screen.dart';
import 'join_group_screen.dart';
import 'live_view_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  Future<void> _callEmergency(String number) async {
    final clean = number.replaceAll(RegExp(r'[^0-9+]'), '');
    if (clean.isEmpty) return;
    await launchUrl(Uri(scheme: 'tel', path: clean));
  }

  Future<void> _pickDateRange(BuildContext context, SigapProvider provider) async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2025),
      lastDate: DateTime(2030),
    );
    if (picked != null) {
      final fmt = DateFormat('yyyy-MM-dd');
      await provider.setFilters(
        dateFrom: fmt.format(picked.start),
        dateTo: fmt.format(picked.end),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<SigapProvider>();
    final group = provider.activeGroup;
    final unhandled = provider.latestUnhandledEvent;

    if (group == null) {
      return const JoinGroupScreen();
    }

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              group.namaGrup,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
            ),
            Text(
              'Lansia: ${group.namaLansia}',
              style: const TextStyle(fontSize: 12, color: Colors.white70),
            ),
          ],
        ),
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
                      child: Text('${g.namaGrup} (${g.namaLansia})'),
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
            tooltip: 'Gabung Grup Lain',
            icon: const Icon(Icons.group_add_outlined),
          ),
          IconButton(
            onPressed: () => provider.logout(),
            tooltip: 'Keluar',
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => provider.refreshGroupsAndEvents(),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Banner Darurat Aktif bila ada event jatuh 'baru'
            if (unhandled != null) ...[
              InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => EventDetailScreen(
                        eventId: unhandled.id,
                        initialEvent: unhandled,
                      ),
                    ),
                  );
                },
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.dangerSoft,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.sos, width: 2),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.warning_rounded, color: AppColors.sos, size: 28),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'PERINGATAN JATUH BELUM DITANGANI!',
                              style: TextStyle(
                                color: AppColors.dangerText,
                                fontWeight: FontWeight.w900,
                                fontSize: 15,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${unhandled.namaLansia} terdeteksi jatuh di ${unhandled.cameraName} (${formatWaktuWib(unhandled.waktu)}).',
                        style: const TextStyle(
                          color: AppColors.dangerText,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: FilledButton.icon(
                              onPressed: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => EventDetailScreen(
                                      eventId: unhandled.id,
                                      initialEvent: unhandled,
                                    ),
                                  ),
                                );
                              },
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.sos,
                              ),
                              icon: const Icon(Icons.visibility_outlined, size: 18),
                              label: const Text('Buka Detail & Kamera'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          IconButton.filled(
                            onPressed: () => _callEmergency(group.kontakDarurat),
                            style: IconButton.styleFrom(
                              backgroundColor: AppColors.sosPressed,
                            ),
                            tooltip: 'Telepon Darurat',
                            icon: const Icon(Icons.phone_in_talk_rounded),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ] else ...[
              // Kartu Status Aman Terpantau
              Container(
                padding: const EdgeInsets.all(15),
                decoration: BoxDecoration(
                  color: AppColors.safeSoft,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.safeBorder),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.verified_user_rounded, color: AppColors.safe, size: 32),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${group.namaLansia} dalam Pemantauan Aman',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 14.5,
                              color: AppColors.safeText,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${group.cameras.where((c) => c.isOnline).length}/${group.cameras.length} kamera aktif memantau ruangan',
                            style: const TextStyle(
                              fontSize: 12.5,
                              color: AppColors.safeText,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Tombol Cepat Live View & SOS
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 52,
                    child: FilledButton.icon(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => const LiveViewScreen()),
                        );
                      },
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      icon: const Icon(Icons.videocam_rounded),
                      label: const Text(
                        'Live View CCTV',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: SizedBox(
                    height: 52,
                    child: FilledButton.icon(
                      onPressed: () => _callEmergency(group.kontakDarurat),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.sos,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      icon: const Icon(Icons.phone_in_talk_rounded),
                      label: const Text(
                        'SOS Darurat',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 22),

            // Header Riwayat & Filter Tanggal / Status
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Riwayat Kejadian',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textPrimary,
                  ),
                ),
                Row(
                  children: [
                    TextButton.icon(
                      onPressed: () => _pickDateRange(context, provider),
                      icon: const Icon(Icons.calendar_today_outlined, size: 15),
                      label: Text(
                        provider.dateFrom != null
                            ? '${provider.dateFrom} - ${provider.dateTo}'
                            : 'Filter Tanggal',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                    if (provider.dateFrom != null || provider.statusFilter.isNotEmpty)
                      IconButton(
                        onPressed: () => provider.setFilters(status: '', clearDates: true),
                        icon: const Icon(Icons.clear, size: 18),
                        tooltip: 'Reset Filter',
                      ),
                  ],
                ),
              ],
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildFilterChip(provider, '', 'Semua'),
                  const SizedBox(width: 8),
                  _buildFilterChip(provider, 'baru', 'Belum Ditangani'),
                  const SizedBox(width: 8),
                  _buildFilterChip(provider, 'ditangani', 'Sudah Ditangani'),
                  const SizedBox(width: 8),
                  _buildFilterChip(provider, 'alarm_palsu', 'Alarm Palsu'),
                ],
              ),
            ),
            const SizedBox(height: 12),

            if (provider.events.isEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 34, horizontal: 16),
                  child: Column(
                    children: [
                      const Icon(
                        Icons.history_toggle_off_rounded,
                        size: 36,
                        color: AppColors.textMuted,
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Belum ada riwayat kejadian pada filter ini.',
                        style: TextStyle(color: AppColors.textMuted, fontSize: 13.5),
                      ),
                    ],
                  ),
                ),
              )
            else
              ...provider.events.map((ev) => _buildEventCard(context, provider, ev)),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterChip(SigapProvider provider, String value, String label) {
    final selected = provider.statusFilter == value;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => provider.setFilters(status: value),
    );
  }

  Widget _buildEventCard(
    BuildContext context,
    SigapProvider provider,
    FallEventModel ev,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => EventDetailScreen(
                eventId: ev.id,
                initialEvent: ev,
              ),
            ),
          );
        },
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: ev.isUnhandled ? AppColors.dangerSoft : AppColors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: ev.isUnhandled ? AppColors.dangerBorder : AppColors.border,
            ),
          ),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  width: 82,
                  height: 64,
                  color: AppColors.videoFrame,
                  child: Image.network(
                    provider.api.resolveSnapshotUrl(ev),
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => const Icon(
                      Icons.broken_image_outlined,
                      color: Colors.white54,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    StatusBadge(status: ev.status),
                    const SizedBox(height: 6),
                    Text(
                      '${ev.namaLansia} · ${ev.cameraName}',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      formatWaktuWib(ev.waktu),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    if (ev.handledByName != null)
                      Text(
                        'Oleh: ${ev.handledByName}',
                        style: const TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: AppColors.safeText,
                        ),
                      ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

