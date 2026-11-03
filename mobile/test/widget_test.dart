import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:sigap_mobile/main.dart';
import 'package:sigap_mobile/services/sigap_provider.dart';

void main() {
  testWidgets('SIGAP app renders smoke test', (WidgetTester tester) async {
    final provider = SigapProvider();
    await tester.pumpWidget(
      ChangeNotifierProvider<SigapProvider>.value(
        value: provider,
        child: const SigapApp(),
      ),
    );
    expect(find.byType(SigapApp), findsOneWidget);
  });
}
