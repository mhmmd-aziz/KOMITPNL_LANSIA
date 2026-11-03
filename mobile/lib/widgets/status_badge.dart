import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class StatusBadge extends StatelessWidget {
  final String status;

  const StatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    if (status == 'baru') {
      return _buildChip(
        bg: AppColors.dangerSoft,
        border: AppColors.dangerBorder,
        textColor: AppColors.dangerText,
        icon: Icons.warning_amber_rounded,
        iconColor: AppColors.sos,
        label: 'BELUM DITANGANI',
      );
    }

    if (status == 'ditangani') {
      return _buildChip(
        bg: AppColors.safeSoft,
        border: AppColors.safeBorder,
        textColor: AppColors.safeText,
        icon: Icons.check_circle_outline,
        iconColor: AppColors.safe,
        label: 'SUDAH DITANGANI',
      );
    }

    return _buildChip(
      bg: AppColors.surfaceMuted,
      border: AppColors.borderStrong,
      textColor: AppColors.textSecondary,
      icon: Icons.cancel_outlined,
      iconColor: AppColors.textMuted,
      label: 'ALARM PALSU',
    );
  }

  Widget _buildChip({
    required Color bg,
    required Color border,
    required Color textColor,
    required IconData icon,
    required Color iconColor,
    required String label,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: iconColor),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: textColor,
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}

