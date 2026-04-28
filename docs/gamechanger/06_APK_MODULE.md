# APK Module

## Static scan scope

V1 does not execute APKs. It only extracts metadata.

Fields:
- sha256
- file size
- package name
- version
- app label
- requested permissions
- activities/services/receivers later
- suspicious strings later
- certificate details later

## Critical permission families

- SMS read/receive/send
- notification listener
- accessibility service
- overlay/system alert window
- device admin
- contacts/call log
- install packages
- query all packages
- foreground service abuse
- battery optimization bypass

## Risk rules

APK sent through social/messaging channel + authority context = critical.

APK requiring SMS/accessibility/overlay + banking/KYC/payment/challan context = critical.

APK claiming government/bank/utility but package name/certificate/domain mismatch = dangerous/critical.

## User copy

“This APK can request access that may expose OTPs, banking notifications, or screen control. Do not install APKs received over WhatsApp/SMS for KYC, challan, bill payment, subsidy, or loan verification.”
