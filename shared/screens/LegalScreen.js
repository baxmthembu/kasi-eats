import React from 'react';
import { ScrollView, Text, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIVACY_POLICY = `Last updated: June 2025

Vuka Eats is a trading name of KulaConnect (Pty) Ltd ("we", "us", or "our"), a company registered in the Republic of South Africa. We operate the Vuka Eats mobile applications. This policy explains how we collect, use, and protect your personal information.

1. INFORMATION WE COLLECT
We collect information you provide directly: name, email address, phone number, delivery addresses, and payment information. We also collect location data (with your permission) to connect you with nearby vendors and track deliveries.

2. HOW WE USE YOUR INFORMATION
- To process and deliver your orders
- To connect customers with vendors and drivers
- To send order status updates and notifications
- To improve our services
- To comply with legal obligations

3. LOCATION DATA
Customer app: Location is used to find nearby vendors and provide delivery estimates. Used only while the app is active.
Driver app: Location is used during active deliveries to show customers their order's progress. Background location is used only while you are marked as online.

4. DATA SHARING
We share your data with:
- Vendors: to fulfil your orders (name, address, order details)
- Drivers: to complete deliveries (name, delivery address)
- Payment processors (PayFast): to process payments securely
- We do not sell your personal data to third parties.

5. DATA RETENTION
We retain your data for as long as your account is active or as required by law. You may request deletion by contacting support.

6. SECURITY
We use industry-standard encryption and Supabase's secure infrastructure to protect your data. Payment processing is handled by PayFast, a PCI-DSS compliant provider.

7. YOUR RIGHTS
You have the right to access, correct, or delete your personal data. Contact us at privacy@vukaeats.co.za.

8. CONTACT
Vuka Eats (a trading name of KulaConnect (Pty) Ltd)
Email: privacy@vukaeats.co.za
Website: https://vukaeats.co.za`;

const TERMS_OF_SERVICE = `Last updated: June 2025

Please read these Terms of Service carefully before using Vuka Eats.

These Terms constitute a binding agreement between you and KulaConnect (Pty) Ltd, trading as Vuka Eats, a company registered in the Republic of South Africa.

1. ACCEPTANCE OF TERMS
By downloading or using the Vuka Eats app, you agree to these terms. If you do not agree, do not use the app.

2. THE SERVICE
Vuka Eats is a food ordering platform that connects customers with local food vendors. We facilitate the ordering and delivery process but are not the food vendor.

3. USER ACCOUNTS
You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials.

4. ORDERING & PAYMENT
- Orders are confirmed only after successful payment via PayFast.
- Prices displayed are final and inclusive of applicable taxes.
- The platform retains a 15% commission; vendors receive 85% of order value.
- Refunds are handled on a case-by-case basis — contact support within 24 hours of your order.

5. CANCELLATIONS & REFUNDS (Consumer Protection Act)
In accordance with the Consumer Protection Act 68 of 2008:
- You may cancel an order within 5 minutes of placing it, provided the vendor has not yet started preparing it. To cancel, contact support immediately via the app.
- If your order is materially different from what was described, or if it is not delivered, you are entitled to a full refund.
- Refund requests must be submitted within 24 hours of the scheduled delivery time. Contact support@vukaeats.co.za with your order number and reason.
- Refunds are processed within 5–7 business days to your original payment method.
- We reserve the right to decline refund requests where the order was delivered as described and within a reasonable time.

6. DELIVERY
- Delivery times are estimates only and may vary due to traffic, weather, or vendor preparation time.
- Vuka Eats is not liable for delays caused by circumstances beyond our control.
- Ensure your delivery address is accurate. We cannot refund orders delivered to an incorrect address provided by the customer.

7. VENDOR OBLIGATIONS
By registering as a vendor on Vuka Eats, you agree to the following:
- You are responsible for the quality, safety, and accurate description of all food items listed on the platform.
- You must comply with all applicable food safety and hygiene regulations, including any Department of Health requirements.
- Vuka Eats retains a 15% commission on all completed orders. Vendors receive 85% of the order value, paid out weekly to the bank account on file.
- Vuka Eats reserves the right to suspend or remove vendors who repeatedly violate food safety, quality, or platform standards.
- Vendor payouts are processed weekly every Sunday. You must have valid bank details saved to receive payment.

8. DRIVER OBLIGATIONS
By registering as a driver on Vuka Eats, you confirm and agree to the following:
- You hold a valid South African driving licence appropriate for the vehicle you use.
- You hold a valid Professional Driving Permit (PDP) as required by the National Road Traffic Act for carrying goods or passengers for reward. Drivers without a valid PDP may not make deliveries on this platform.
- Your vehicle is roadworthy and covered by valid vehicle insurance. Vuka Eats is not liable for any accidents, injuries, or damages arising from your use of a vehicle while making deliveries.
- You operate as an independent contractor, not an employee of Vuka Eats.
- You must comply with all traffic laws and road safety regulations at all times.

9. PROHIBITED CONDUCT
You may not use Vuka Eats to engage in fraud, harassment, or any illegal activity. Accounts found in violation will be suspended.

10. LIMITATION OF LIABILITY
To the maximum extent permitted by law, Vuka Eats is not liable for indirect, incidental, or consequential damages arising from use of our service. Our total liability to you shall not exceed the value of the order in dispute.

11. CHANGES TO TERMS
We may update these terms from time to time. Continued use of the app after changes constitutes acceptance of the updated terms.

12. GOVERNING LAW
These terms are governed by the laws of the Republic of South Africa. Any disputes shall be subject to the jurisdiction of the South African courts.

13. CONTACT
Vuka Eats (a trading name of KulaConnect (Pty) Ltd)
Email: legal@vukaeats.co.za
Website: https://vukaeats.co.za`;

export default function LegalScreen({ route }) {
  const type = route?.params?.type || 'privacy';
  const isPrivacy = type === 'privacy';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>
          {isPrivacy ? 'Privacy Policy' : 'Terms of Service'}
        </Text>
        <Text style={styles.body}>
          {isPrivacy ? PRIVACY_POLICY : TERMS_OF_SERVICE}
        </Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  content:   { padding: 20 },
  title:     { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 20 },
  body:      { fontSize: 14, lineHeight: 22, color: '#374151' },
});
