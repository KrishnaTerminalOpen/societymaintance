import {
  PrismaClient,
  UserRole,
  UserStatus,
  HouseType,
  DepositStatus,
  PaymentStatus,
  PaymentMethod,
  AuditAction,
} from '@prisma/client';

const prisma = new PrismaClient();

// Helper to format paise into readable logging
const formatRupees = (paise: bigint): string => {
  return `₹${(Number(paise) / 100).toLocaleString('en-IN')}`;
};

const INDIAN_FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
  'Shaurya', 'Atharv', 'Advik', 'Pranav', 'Advaith', 'Aaryav', 'Dhruv', 'Kabir', 'Rudra', 'Ananya',
  'Diya', 'Gauri', 'Anushka', 'Navya', 'Isha', 'Aadhya', 'Saanvi', 'Myra', 'Sara', 'Riya',
  'Pari', 'Anika', 'Tara', 'Avani', 'Kavya', 'Meera', 'Rohan', 'Kunal', 'Suresh', 'Manish',
  'Deepak', 'Alok', 'Neha', 'Pooja', 'Sneha', 'Priya', 'Amit', 'Naveen', 'Sanjay', 'Rahul'
];

const INDIAN_LAST_NAMES = [
  'Verma', 'Sharma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Singh', 'Chopra', 'Mehta',
  'Bhatia', 'Joshi', 'Deshmukh', 'Kulkarni', 'Menon', 'Pillai', 'Rao', 'Aggarwal', 'Mishra', 'Pandey',
  'Das', 'Banerjee', 'Chatterjee', 'Mukherjee', 'Bose', 'Kapoor', 'Khanna', 'Malhotra', 'Soni', 'Bansal',
  'Saxena', 'Trivedi', 'Pandit', 'Thakur', 'Gowda', 'Hegde', 'Shetty', 'Kamath', 'Nambiar', 'Kurup',
  'Chauhan', 'Yadav', 'Dubey', 'Tiwari', 'Shukla', 'Bhatt', 'Nath', 'Sen', 'Dutta', 'Ghosh'
];

async function main() {
  console.info('🌱 Starting ColonyDeposit database seed...');

  // 1. Clean existing records to allow idempotent re-seeding
  console.info('Cleaning old database records...');
  await prisma.auditLog.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.deposit.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.house.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();

  // 2. Seed Colony Settings
  console.info('Seeding Colony Settings...');
  await prisma.setting.create({
    data: {
      id: 'default',
      colonyName: 'Greenwood Palms Resident Welfare Association',
      logoUrl: 'https://cdn.colonydeposit.example.com/assets/logo.png',
      address: 'Plot 42, Outer Ring Road, Sector 7, Whitefield, Bengaluru, Karnataka 560066',
      contactPhone: '+918028001000',
      contactEmail: 'committee@greenwoodpalms.org',
      depositRules: {
        standardDepositPaise: {
          FLAT_1BHK: 2500000, // ₹25,000
          FLAT_2BHK: 4000000, // ₹40,000
          FLAT_3BHK: 6000000, // ₹60,000
          FLAT_4BHK: 8000000, // ₹80,000
          VILLA: 12000000,   // ₹1,20,000
          PENTHOUSE: 15000000,
          PLOT: 3000000,
        },
        maxInstallmentsAllowed: 2,
        refundablePercentage: 100,
        moveOutNoticeDays: 30,
      },
      lateFeeRules: {
        gracePeriodDays: 10,
        fixedLateFeePaise: 50000, // ₹500 fixed late fee
        dailyInterestPercentage: 0.05,
      },
      enabledPaymentMethods: [
        'UPI',
        'NET_BANKING',
        'DEBIT_CARD',
        'CREDIT_CARD',
        'CASH',
        'CHEQUE',
        'BANK_TRANSFER',
      ],
    },
  });

  // 3. Seed Super Admin & Admins
  console.info('Seeding Super Admin and Committee Admins...');
  const superAdmin = await prisma.user.create({
    data: {
      name: 'Col. Rajeshwar Bakshi',
      phone: '+919800000001',
      email: 'president@greenwoodpalms.org',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  const admin1 = await prisma.user.create({
    data: {
      name: 'Sunita Ramanathan',
      phone: '+919800000002',
      email: 'treasurer@greenwoodpalms.org',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  const admin2 = await prisma.user.create({
    data: {
      name: 'Vikram Malhotra',
      phone: '+919800000003',
      email: 'secretary@greenwoodpalms.org',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  // 4. Seed 50 Residents and 50 Houses
  console.info('Seeding 50 Residents and Houses...');
  const blocks = ['A', 'B', 'C', 'D'];
  const houseTypes: HouseType[] = [
    HouseType.FLAT_1BHK,
    HouseType.FLAT_2BHK,
    HouseType.FLAT_3BHK,
    HouseType.FLAT_4BHK,
    HouseType.VILLA,
  ];

  const depositAmountsByType: Record<HouseType, bigint> = {
    FLAT_1BHK: 2500000n, // ₹25,000
    FLAT_2BHK: 4000000n, // ₹40,000
    FLAT_3BHK: 6000000n, // ₹60,000
    FLAT_4BHK: 8000000n, // ₹80,000
    VILLA: 12000000n,    // ₹1,20,000
    PENTHOUSE: 15000000n,
    PLOT: 3000000n,
  };

  const createdResidents = [];
  const createdHouses = [];

  for (let i = 0; i < 50; i++) {
    const firstName = INDIAN_FIRST_NAMES[i % INDIAN_FIRST_NAMES.length];
    const lastName = INDIAN_LAST_NAMES[i % INDIAN_LAST_NAMES.length];
    const phone = `+91981110${(i + 1).toString().padStart(4, '0')}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i + 1}@example.com`;

    const resident = await prisma.user.create({
      data: {
        name: `${firstName} ${lastName}`,
        phone,
        email,
        role: UserRole.RESIDENT,
        status: UserStatus.ACTIVE,
      },
    });
    createdResidents.push(resident);

    const block = blocks[Math.floor(i / 13) % blocks.length];
    const floor = Math.floor((i % 13) / 4) + 1;
    const unit = ((i % 13) % 4) + 1;
    const houseNumber = `${floor}0${unit}`;
    const type = houseTypes[i % houseTypes.length];

    const house = await prisma.house.create({
      data: {
        block,
        houseNumber,
        type,
        ownerId: resident.id,
      },
    });
    createdHouses.push(house);
  }

  // 5. Seed Deposits, Payments, Receipts, and Audit Logs
  // Distribution across 50 houses:
  // - 0 to 24 (25 units): PAID
  // - 25 to 34 (10 units): PARTIAL
  // - 35 to 44 (10 units): PENDING
  // - 45 to 49 (5 units): OVERDUE
  console.info('Seeding Deposits, Payments, Receipts, and Audit Logs...');

  let receiptCounter = 1001;

  for (let i = 0; i < createdHouses.length; i++) {
    const house = createdHouses[i];
    const resident = createdResidents[i];
    const standardAmount = depositAmountsByType[house.type];

    if (i < 25) {
      // FULLY PAID DEPOSIT
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 15);

      const deposit = await prisma.deposit.create({
        data: {
          houseId: house.id,
          title: 'Mandatory Colony Security Deposit 2026',
          amountDue: standardAmount,
          amountPaid: standardAmount,
          status: DepositStatus.PAID,
          dueDate,
        },
      });

      const isOffline = i % 5 === 0;
      const paymentMethod = isOffline
        ? PaymentMethod.CASH
        : i % 2 === 0
          ? PaymentMethod.UPI
          : PaymentMethod.NET_BANKING;

      const orderId = isOffline ? null : `order_live_rzp_${100000 + i}`;
      const paymentId = isOffline ? null : `pay_live_rzp_${800000 + i}`;

      const payment = await prisma.payment.create({
        data: {
          depositId: deposit.id,
          userId: resident.id,
          amount: standardAmount,
          method: paymentMethod,
          gatewayOrderId: orderId,
          gatewayPaymentId: paymentId,
          status: PaymentStatus.SUCCESS,
          idempotencyKey: `idemp_paid_${deposit.id}_${i}`,
          isOffline,
          offlineNotes: isOffline ? 'Cash received at society clubhouse counter' : null,
          offlineVerifiedBy: isOffline ? admin1.id : null,
          offlineVerifiedAt: isOffline ? new Date() : null,
          createdAt: new Date(Date.now() - (30 - i) * 86400000),
        },
      });

      // Receipt for fully paid
      const receiptNum = `REC-2026-${receiptCounter++}`;
      await prisma.receipt.create({
        data: {
          paymentId: payment.id,
          receiptNumber: receiptNum,
          pdfUrl: `https://cdn.colonydeposit.example.com/receipts/${receiptNum}.pdf`,
          generatedAt: new Date(payment.createdAt),
        },
      });

      // Audit Log entry
      await prisma.auditLog.create({
        data: {
          actorId: isOffline ? admin1.id : resident.id,
          actorPhone: isOffline ? admin1.phone : resident.phone,
          action: isOffline ? AuditAction.OFFLINE_PAYMENT_RECORDED : AuditAction.PAYMENT_VERIFIED,
          entity: 'Payment',
          entityId: payment.id,
          before: { depositStatus: DepositStatus.PENDING, amountPaid: 0 },
          after: {
            depositStatus: DepositStatus.PAID,
            amountPaid: standardAmount.toString(),
            paymentStatus: PaymentStatus.SUCCESS,
            receiptNumber: receiptNum,
          },
          ipAddress: isOffline ? '192.168.1.100' : `157.48.201.${i + 10}`,
          userAgent: isOffline
            ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ColonyApp Admin'
            : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ColonyApp Mobile',
          createdAt: payment.createdAt,
        },
      });
    } else if (i < 35) {
      // PARTIALLY PAID DEPOSIT (Half paid)
      const halfAmount = standardAmount / 2n;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 10);

      const deposit = await prisma.deposit.create({
        data: {
          houseId: house.id,
          title: 'Mandatory Colony Security Deposit 2026',
          amountDue: standardAmount,
          amountPaid: halfAmount,
          status: DepositStatus.PARTIAL,
          dueDate,
        },
      });

      const payment = await prisma.payment.create({
        data: {
          depositId: deposit.id,
          userId: resident.id,
          amount: halfAmount,
          method: PaymentMethod.UPI,
          gatewayOrderId: `order_partial_${100000 + i}`,
          gatewayPaymentId: `pay_partial_${800000 + i}`,
          status: PaymentStatus.SUCCESS,
          idempotencyKey: `idemp_part_${deposit.id}_${i}`,
          isOffline: false,
          createdAt: new Date(Date.now() - 5 * 86400000),
        },
      });

      const receiptNum = `REC-2026-${receiptCounter++}`;
      await prisma.receipt.create({
        data: {
          paymentId: payment.id,
          receiptNumber: receiptNum,
          pdfUrl: `https://cdn.colonydeposit.example.com/receipts/${receiptNum}.pdf`,
          generatedAt: payment.createdAt,
        },
      });

      await prisma.auditLog.create({
        data: {
          actorId: resident.id,
          actorPhone: resident.phone,
          action: AuditAction.PAYMENT_VERIFIED,
          entity: 'Payment',
          entityId: payment.id,
          before: { depositStatus: DepositStatus.PENDING, amountPaid: 0 },
          after: {
            depositStatus: DepositStatus.PARTIAL,
            amountPaid: halfAmount.toString(),
            remainingDue: (standardAmount - halfAmount).toString(),
          },
          ipAddress: `157.48.202.${i + 10}`,
          userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:128.0) ColonyApp Mobile',
          createdAt: payment.createdAt,
        },
      });
    } else if (i < 45) {
      // PENDING DEPOSIT (Due in future, no payments yet)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 20);

      await prisma.deposit.create({
        data: {
          houseId: house.id,
          title: 'Mandatory Colony Security Deposit 2026',
          amountDue: standardAmount,
          amountPaid: 0n,
          status: DepositStatus.PENDING,
          dueDate,
        },
      });
    } else {
      // OVERDUE DEPOSIT (Due date 15 days ago, unpaid)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() - 15);

      await prisma.deposit.create({
        data: {
          houseId: house.id,
          title: 'Mandatory Colony Security Deposit 2026',
          amountDue: standardAmount,
          amountPaid: 0n,
          status: DepositStatus.OVERDUE,
          dueDate,
        },
      });
    }
  }

  // Sample Audit Log for Committee Admin Settings initialization
  await prisma.auditLog.create({
    data: {
      actorId: superAdmin.id,
      actorPhone: superAdmin.phone,
      action: AuditAction.SETTINGS_UPDATED,
      entity: 'Setting',
      entityId: 'default',
      before: null,
      after: { initialized: true, by: 'Super Admin' },
      ipAddress: '103.21.124.5',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ColonyApp Admin Console',
    },
  });

  console.info('✅ Seed completed successfully:');
  console.info(`   - 1 Super Admin: ${superAdmin.phone} (${superAdmin.name})`);
  console.info(`   - 2 Admins: ${admin1.phone}, ${admin2.phone}`);
  console.info(`   - 50 Residents and 50 Houses seeded across Blocks A, B, C, D`);
  console.info(`   - 25 Paid Deposits with Receipts & Audit Trails`);
  console.info(`   - 10 Partial Deposits`);
  console.info(`   - 10 Pending Deposits`);
  console.info(`   - 5 Overdue Deposits`);
  console.info(`   - Colony settings and audit logs verified`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

