import React from 'react';
import { ScrollView, Text, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIVACY_POLICY = `Last updated: June 2025

Kasi Eats ("we", "us", or "our") operates the Kasi Eats mobile applications. This policy explains how we collect, use, and protect your personal information.

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
You have the right to access, correct, or delete your personal data. Contact us at privacy@kasieats.com.

8. CONTACT
Kasi Eats
Email: privacy@kasieats.com
Website: https://kasieats.com`;

const TERMS_OF_SERVICE = `Last updated: June 2025

Please read these Terms of Service carefully before using Kasi Eats.

1. ACCEPTANCE OF TERMS
By downloading or using the Kasi Eats app, you agree to these terms. If you do not agree, do not use the app.

2. THE SERVICE
Kasi Eats is a food ordering platform that connects customers with local food vendors. We facilitate the ordering and delivery process but are not the food vendor.

3. USER ACCOUNTS
You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials.

4. ORDERING & PAYMENT
- Orders are confirmed only after successful payment via PayFast.
- Prices displayed are final and inclusive of applicable taxes.
- The platform retains a 15% commission; vendors receive 85% of order value.
- Refunds are handled on a case-by-case basis — contact support within 24 hours.

5. DELIVERY
- Delivery times are estimates only and may vary.
- Kasi Eats is not liable for delays caused by traffic, weather, or circumstances beyond our control.
- Ensure your delivery address is accurate. We cannot refund orders delivered to an incorrect address provided by the customer.

6. VENDOR OBLIGATIONS
Vendors must ensure food is prepared safely and matches the description on the app. Kasi Eats reserves the right to remove vendors who repeatedly violate food safety or quality standards.

7. DRIVER OBLIGATIONS
Drivers must maintain valid licences, roadworthy vehicles, and comply with all traffic laws. Drivers operate as independent contractors.

8. PROHIBITED CONDUCT
You may not use Kasi Eats to engage in fraud, harassment, or any illegal activity. Accounts found in violation will be suspended.

9. LIMITATION OF LIABILITY
To the maximum extent permitted by law, Kasi Eats is not liable for indirect, incidental, or consequential damages arising from use of our service.

10. CHANGES TO TERMS
We may update these terms. Continued use of the app after changes constitutes acceptance of the new terms.

11. GOVERNING LAW
These terms are governed by the laws of the Republic of South Africa.

12. CONTACT
Kasi Eats
Email: legal@kasieats.com
Website: https://kasieats.com`;

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
