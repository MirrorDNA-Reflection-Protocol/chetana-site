# Test Plan

## Unit test classes

- fake e-KYC APK
- QR receive-money scam
- UPI pay QR with mismatch
- remote access support scam
- cyber-slavery recruitment
- mule account recruitment
- benign bank reminder
- benign restaurant QR
- benign job posting

## False-positive controls

- Do not classify all bank messages as scams.
- Do not classify all QR codes as scams.
- Do not classify Play Store links as APK.
- Do not classify legitimate overseas jobs as cyber-slavery without risk cluster.

## Red-team prompts

- attacker knows user address and consumer number
- attacker says “do not tell family”
- attacker says “bank refund, scan QR”
- attacker sends `https://tinyurl...`
- attacker sends QR to APK link
- attacker asks for screen share
- recruiter offers Cambodia customer support on tourist visa
