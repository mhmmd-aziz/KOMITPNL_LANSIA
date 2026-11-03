import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/event_model.dart';
import '../services/sigap_provider.dart';
import '../theme/app_colors.dart';
import '../utils/whatsapp_emergency.dart';
import '../widgets/status_badge.dart';
import 'event_detail_screen.dart';
import 'family_lock_screen.dart';
import 'family_settings_screen.dart';
import 'join_group_screen.dart';
import 'live_view_screen.dart';
import 'safe_zone_lab_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentTabIndex = 0;

  Future<void> _callEmergency(String number) async {
    final clean = number.replaceAll(RegExp(r'[^0-9+]'), '');
    if (clean.isEmpty) return;
    await launchUrl(Uri(scheme: 'tel', path: clean));
  }

  Future<void> _pickDateRange(
    BuildContext context,
    SigapProvider provider,
  ) async {
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
    final unhandledCount = provider.events.where((e) => e.isUnhandled).length;

    if (group == null) {
      return const JoinGroupScreen();
    }

    if (provider.isCurrentGroupLocked) {
      return const FamilyLockScreen();
    }

    final tabTitles = <String>[
      group.namaGrup,
      'Kamera & Interkom 2 Arah',
      'Area Aman & Video POV',
      'Keluarga & Kode Kunci',
    ];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 14,
        title: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(9),
              ),
              child: Image.asset(
                'assets/images/logo_aplikasi.png',
                fit: BoxFit.contain,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tabTitles[_currentTabIndex],
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    'Lansia: ${group.namaLansia}',
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11.5, color: Colors.white70),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          if (provider.groups.length > 1)
            PopupMenuButton<int>(
              tooltip: 'Ganti Grup Keluarga',
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
            tooltip: 'Buat / Gabung Grup Lain',
            icon: const Icon(Icons.group_add_outlined),
          ),
          IconButton(
            onPressed: () => provider.lockCurrentGroup(),
            tooltip: 'Kunci Akses Keluarga',
            icon: const Icon(Icons.lock_outline_rounded),
          ),
          IconButton(
            onPressed: () => provider.logout(),
            tooltip: 'Keluar Akun',
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: IndexedStack(
        index: _currentTabIndex,
        children: [
          _buildBerandaTab(context, provider, group.namaLansia, group.kontakDarurat, unhandled),
          const LiveViewScreen(embeddedInTab: true),
          const SafeZoneLabScreen(embeddedInTab: true),
          const FamilySettingsScreen(embeddedInTab: true),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: const Border(top: BorderSide(color: AppColors.border)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 16,
              offset: const Offset(0, -3),
            ),
          ],
        ),
        child: NavigationBarTheme(
          data: NavigationBarThemeData(
            backgroundColor: AppColors.surface,
            indicatorColor: const Color(0xFFCCFBF1),
            labelTextStyle: WidgetStateProperty.resolveWith((states) {
              final selected = states.contains(WidgetState.selected);
              return TextStyle(
                fontSize: 11.5,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                color: selected ? AppColors.primaryDark : AppColors.textMuted,
              );
            }),
            iconTheme: WidgetStateProperty.resolveWith((states) {
              final selected = states.contains(WidgetState.selected);
              return IconThemeData(
                size: 24,
                color: selected ? AppColors.primary : AppColors.textMuted,
              );
            }),
          ),
          child: NavigationBar(
            height: 68,
            elevation: 0,
            selectedIndex: _currentTabIndex,
            onDestinationSelected: (idx) {
              if (idx == 1) {
                provider.markCctvVoiceRead();
              }
              setState(() => _currentTabIndex = idx);
            },
            destinations: [
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: unhandledCount > 0,
                  backgroundColor: AppColors.sos,
                  label: Text('$unhandledCount'),
                  child: const Icon(Icons.home_outlined),
                ),
                selectedIcon: Badge(
                  isLabelVisible: unhandledCount > 0,
                  backgroundColor: AppColors.sos,
                  label: Text('$unhandledCount'),
                  child: const Icon(Icons.home_rounded),
                ),
                label: 'Beranda',
              ),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: provider.unreadCctvVoiceCount > 0,
                  backgroundColor: AppColors.primary,
                  label: Text('${provider.unreadCctvVoiceCount}'),
                  child: const Icon(Icons.videocam_outlined),
                ),
                selectedIcon: const Icon(Icons.videocam_rounded),
                label: 'Live & Suara',
              ),
              const NavigationDestination(
                icon: Icon(Icons.crop_free_rounded),
                selectedIcon: Icon(Icons.shield_rounded),
                label: 'Area Aman',
              ),
              const NavigationDestination(
                icon: Icon(Icons.vpn_key_outlined),
                selectedIcon: Icon(Icons.vpn_key_rounded),
                label: 'Keluarga',
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBerandaTab(
    BuildContext context,
    SigapProvider provider,
    String namaLansia,
    String kontakDarurat,
    FallEventModel? unhandled,
  ) {
    final group = provider.activeGroup!;
    final latestVoice = provider.latestCctvVoice;

    return RefreshIndicator(
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
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(
                          Icons.location_on_rounded,
                          size: 15,
                          color: AppColors.sos,
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            'Lokasi CCTV: ${unhandled.effectiveLokasiCctv}',
                            style: const TextStyle(
                              color: AppColors.dangerText,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
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
                          onPressed: () =>
                              WhatsAppEmergencyHelper.sendFallEventToWhatsApp(
                            unhandled,
                          ),
                          style: IconButton.styleFrom(
                            backgroundColor: const Color(0xFF15803D),
                          ),
                          tooltip: 'Kirim WA Darurat + Lokasi CCTV',
                          icon: const Icon(Icons.chat_rounded),
                        ),
                        const SizedBox(width: 6),
                        IconButton.filled(
                          onPressed: () => _callEmergency(kontakDarurat),
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
            const SizedBox(height: 14),
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
                  const Icon(
                    Icons.verified_user_rounded,
                    color: AppColors.safe,
                    size: 32,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '$namaLansia dalam Pemantauan Aman',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 14.5,
                            color: AppColors.safeText,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${group.cameras.where((c) => c.isOnline).length}/${group.cameras.length} kamera terdaftar pada rumah ini',
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
            const SizedBox(height: 14),
          ],

          // Kartu Suara Masuk Terbaru dari Mikrofon POV CCTV (bila ada)
          if (latestVoice != null) ...[
            Container(
              padding: const EdgeInsets.all(13),
              decoration: BoxDecoration(
                color: AppColors.primarySoft,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.primaryBorder),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.graphic_eq_rounded,
                    color: AppColors.primary,
                    size: 26,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Suara dari ${latestVoice['sender_name'] ?? 'POV CCTV'}',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                            color: AppColors.primaryDark,
                          ),
                        ),
                        const Text(
                          'Ketuk Putar untuk mendengar atau balas di tab Live & Suara',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  FilledButton.tonalIcon(
                    onPressed: () {
                      final url = latestVoice['url']?.toString() ?? '';
                      provider.markCctvVoiceRead();
                      if (provider.isPlayingVoice) {
                        provider.stopVoicePlayback();
                      } else if (url.isNotEmpty) {
                        provider.playVoiceUrl(url);
                      }
                    },
                    icon: Icon(
                      provider.isPlayingVoice
                          ? Icons.stop_rounded
                          : Icons.volume_up_rounded,
                      size: 16,
                    ),
                    label: Text(provider.isPlayingVoice ? 'Stop' : 'Putar'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
          ],

          // Pintasan Cepat Area Aman, SOS Darurat, & WA Darurat + Lokasi CCTV
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 50,
                  child: FilledButton.icon(
                    onPressed: () => setState(() => _currentTabIndex = 2),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: const Icon(Icons.crop_free_rounded, size: 19),
                    label: const Text(
                      'Atur Area Aman',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: SizedBox(
                  height: 50,
                  child: FilledButton.icon(
                    onPressed: () => _callEmergency(kontakDarurat),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.sos,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: const Icon(Icons.phone_in_talk_rounded, size: 19),
                    label: const Text(
                      'SOS Telepon',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 48,
            child: FilledButton.icon(
              onPressed: () {
                if (unhandled != null) {
                  WhatsAppEmergencyHelper.sendFallEventToWhatsApp(unhandled);
                } else if (group.cameras.isNotEmpty) {
                  WhatsAppEmergencyHelper.sendCameraEmergencyToWhatsApp(
                    rawPhone: kontakDarurat,
                    namaLansia: namaLansia,
                    namaGrup: group.namaGrup,
                    camera: group.cameras.first,
                  );
                }
              },
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF15803D),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              icon: const Icon(Icons.chat_rounded, size: 19),
              label: const Text(
                'Kirim Pesan WA Darurat + Lokasi CCTV',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ),
          const SizedBox(height: 20),

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
                      onPressed: () =>
                          provider.setFilters(status: '', clearDates: true),
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
                padding:
                    const EdgeInsets.symmetric(vertical: 34, horizontal: 16),
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
                      style:
                          TextStyle(color: AppColors.textMuted, fontSize: 13.5),
                    ),
                  ],
                ),
              ),
            )
          else
            ...provider.events
                .map((ev) => _buildEventCard(context, provider, ev)),
        ],
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
              color:
                  ev.isUnhandled ? AppColors.dangerBorder : AppColors.border,
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
