import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/event_model.dart';
import '../models/group_model.dart';

class WhatsAppEmergencyHelper {
  /// Ubah nomor telepon lokal Indonesia (mis. 0812... atau +62812...) ke format internasional 62812...
  static String normalizeWhatsAppPhone(String rawPhone) {
    final digits = rawPhone.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.isEmpty) return '';
    if (digits.startsWith('0')) {
      return '62${digits.substring(1)}';
    }
    if (digits.startsWith('8')) {
      return '62$digits';
    }
    return digits;
  }

  static String _formatWib(String rawIso) {
    if (rawIso.isEmpty) {
      final nowWib = DateTime.now().toUtc().add(const Duration(hours: 7));
      return '${DateFormat('dd MMM yyyy, HH:mm:ss').format(nowWib)} WIB';
    }
    try {
      final dt = DateTime.parse(rawIso).toUtc().add(const Duration(hours: 7));
      return '${DateFormat('dd MMM yyyy, HH:mm:ss').format(dt)} WIB';
    } catch (_) {
      return rawIso;
    }
  }

  /// Ekstrak link Google Maps jika sudah ada di teks lokasi CCTV, atau buat link pencarian Maps otomatis.
  static ({String cleanLocation, String mapsUrl}) extractOrBuildMapsLink({
    required String lokasiCctv,
    required String cameraName,
    required String namaGrup,
  }) {
    final raw = lokasiCctv.trim().isNotEmpty
        ? lokasiCctv.trim()
        : '$cameraName, $namaGrup';

    final urlRegex = RegExp(r'https?://\S+');
    final match = urlRegex.firstMatch(raw);
    if (match != null) {
      final foundUrl = match.group(0)!.replaceAll(RegExp(r'[),.]+$'), '');
      final textWithoutUrl = raw
          .replaceAll(match.group(0)!, '')
          .replaceAll(RegExp(r'\(\s*\)'), '')
          .replaceAll(RegExp(r'\s+-\s*$'), '')
          .trim();
      return (
        cleanLocation: textWithoutUrl.isNotEmpty ? textWithoutUrl : '$cameraName, $namaGrup',
        mapsUrl: foundUrl,
      );
    }

    final query = Uri.encodeComponent('$raw $namaGrup'.trim());
    return (
      cleanLocation: raw,
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=$query',
    );
  }

  /// Kirim pesan darurat jatuh ke WhatsApp lengkap dengan Lokasi CCTV tempat kejadian.
  static Future<bool> sendFallEventToWhatsApp(FallEventModel event) async {
    final locInfo = extractOrBuildMapsLink(
      lokasiCctv: event.effectiveLokasiCctv,
      cameraName: event.cameraName,
      namaGrup: event.namaGrup,
    );

    final waktuStr = _formatWib(event.waktu);
    final confPct = (event.confidence * 100).toStringAsFixed(0);

    final message = [
      '🚨 *DARURAT SIGAP — DETEKSI JATUH LANSIA* 🚨',
      'Mohon bantuan segera menuju *Lokasi CCTV* berikut:',
      '',
      '👤 *Nama Lansia:* ${event.namaLansia}',
      '🏠 *Rumah / Keluarga:* ${event.namaGrup}',
      '📹 *Unit Kamera CCTV:* ${event.cameraName} (CCTV #${event.cameraId})',
      '📍 *Lokasi CCTV:* ${locInfo.cleanLocation}',
      '🕒 *Waktu Terdeteksi:* $waktuStr',
      '🎯 *Keyakinan AI:* $confPct%',
      '🗺️ *Titik Maps Lokasi CCTV:* ${locInfo.mapsUrl}',
      '',
      '_Pesan darurat otomatis beserta lokasi titik CCTV dari aplikasi SIGAP Keluarga._',
    ].join('\n');

    return launchWhatsAppMessage(
      rawPhone: event.kontakDarurat,
      message: message,
    );
  }

  /// Kirim pesan darurat ke WhatsApp langsung dari unit Kamera CCTV yang sedang dipantau.
  static Future<bool> sendCameraEmergencyToWhatsApp({
    required String rawPhone,
    required String namaLansia,
    required String namaGrup,
    required CameraModel camera,
  }) async {
    final locInfo = extractOrBuildMapsLink(
      lokasiCctv: camera.effectiveLokasiCctv(namaGrup),
      cameraName: camera.namaRuangan,
      namaGrup: namaGrup,
    );

    final waktuStr = _formatWib('');
    final message = [
      '🚨 *DARURAT SIGAP — BANTUAN DI LOKASI CCTV* 🚨',
      'Mohon bantuan segera menuju *Lokasi CCTV* berikut:',
      '',
      '👤 *Nama Lansia:* $namaLansia',
      '🏠 *Rumah / Keluarga:* $namaGrup',
      '📹 *Unit Kamera CCTV:* ${camera.namaRuangan} (CCTV #${camera.id})',
      '📍 *Lokasi CCTV:* ${locInfo.cleanLocation}',
      '🕒 *Waktu Panggilan:* $waktuStr',
      '🗺️ *Titik Maps Lokasi CCTV:* ${locInfo.mapsUrl}',
      '',
      '_Dikirim dari pantauan CCTV aplikasi SIGAP Keluarga._',
    ].join('\n');

    return launchWhatsAppMessage(rawPhone: rawPhone, message: message);
  }

  static Future<bool> launchWhatsAppMessage({
    required String rawPhone,
    required String message,
  }) async {
    final waPhone = normalizeWhatsAppPhone(rawPhone);
    final encodedText = Uri.encodeComponent(message);

    // Prioritas 1: Deep link langsung ke aplikasi WhatsApp native
    final nativeUri = Uri.parse(
      waPhone.isNotEmpty
          ? 'whatsapp://send?phone=$waPhone&text=$encodedText'
          : 'whatsapp://send?text=$encodedText',
    );
    try {
      final launchedNative = await launchUrl(
        nativeUri,
        mode: LaunchMode.externalApplication,
      );
      if (launchedNative) return true;
    } catch (_) {}

    // Prioritas 2: Fallback universal https://wa.me/
    final webUri = Uri.parse(
      waPhone.isNotEmpty
          ? 'https://wa.me/$waPhone?text=$encodedText'
          : 'https://wa.me/?text=$encodedText',
    );
    try {
      return await launchUrl(
        webUri,
        mode: LaunchMode.externalApplication,
      );
    } catch (_) {
      return false;
    }
  }
}

