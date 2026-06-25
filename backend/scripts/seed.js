require('dotenv').config({ path: __dirname + '/../.env' });
const { supabase } = require('../src/config/supabase');
const bcrypt = require('bcryptjs');

const vendorsData = [
  {
    email: 'mamas@example.com',
    name: 'Mama Joy',
    business_name: "Mama Joy's Kitchen",
    description: 'Authentic Soweto kotas and traditional meals cooked with love.',
    address: '1442 Vilakazi St, Orlando West, Soweto',
    latitude: -26.2385,
    longitude: 27.9040,
    rating: 4.8,
    total_reviews: 45,
    is_open: true,
    menu: [
      { name: 'Special Kota', description: 'Polony, chips, cheese, russian, egg, and atchar.', price: 55.00, category: 'Kotas' },
      { name: 'Beef Stew', description: 'Slow cooked beef stew served with pap and chakalaka.', price: 75.00, category: 'Traditional' }
    ]
  },
  {
    email: 'shisa@example.com',
    name: 'Sipho Ndlovu',
    business_name: 'Sipho Shisanyama',
    description: 'The best braai meat in the local community. Fresh and smoky.',
    address: '56 Block B, Diepkloof, Soweto',
    latitude: -26.2510,
    longitude: 27.8545,
    rating: 4.5,
    total_reviews: 112,
    is_open: true,
    menu: [
      { name: 'Mixed Braai Plate', description: 'Chuck, Wors, Chicken wing served with pap.', price: 120.00, category: 'Braai' },
      { name: 'Wors Roll', description: 'Big braaied wors with spicy tomato relish.', price: 40.00, category: 'Fast Food' }
    ]
  },
  {
    email: 'gogo@example.com',
    name: 'Gogo Dlamini',
    business_name: "Gogo's Vetkoek",
    description: 'Hot, fresh magwinya (vetkoek) every morning to keep you moving.',
    address: '22 Maponya Rd, Klipspruit, Soweto',
    latitude: -26.2480,
    longitude: 27.8500,
    rating: 4.9,
    total_reviews: 80,
    is_open: true,
    menu: [
      { name: 'Magwinya & Polony', description: '3 fat cakes with a large slice of polony.', price: 25.00, category: 'Breakfast' },
      { name: 'Mince Magwinya', description: '1 giant fat cake stuffed with curried mince.', price: 35.00, category: 'Breakfast' }
    ]
  }
];

async function seed() {
  console.log('🌱 Starting database seed...');
  let usersCreated = 0;
  let skipped = 0;

  for (const v of vendorsData) {
    try {
      // 1. Create Auth User
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: v.email,
        password: 'password123',
        email_confirm: true,
      });

      if (authError) {
        if (authError.message.includes('already exists')) {
          console.log(`User ${v.email} already exists, skipping.`);
          skipped++;
          continue;
        }
        throw authError;
      }

      const userId = authData.user.id;
      const passHash = await bcrypt.hash('password123', 10);

      // 2. Create User Profile
      await supabase.from('users').insert({
        id: userId,
        email: v.email,
        password_hash: passHash,
        name: v.name,
        role: 'vendor',
      });

      // 3. Create Vendor Profile
      const { data: vendorData, error: vendorError } = await supabase.from('vendors').insert({
        user_id: userId,
        business_name: v.business_name,
        description: v.description,
        address: v.address,
        latitude: v.latitude,
        longitude: v.longitude,
        rating: v.rating,
        total_reviews: v.total_reviews,
        is_open: v.is_open,
      }).select().single();

      if (vendorError) throw vendorError;

      // 4. Create Menu Items
      const menuItems = v.menu.map(item => ({
        vendor_id: vendorData.id,
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        is_available: true,
      }));

      await supabase.from('menu_items').insert(menuItems);
      
      console.log(`✅ successfully seeded vendor: ${v.business_name}`);
      usersCreated++;

    } catch (error) {
      console.error(`❌ Error seeding ${v.email}:`, error.message);
    }
  }

  console.log(`\n🎉 Seeding complete! Created ${usersCreated} vendors. Skipped ${skipped}.`);
  console.log(`Note: Login manually using any email (e.g. mamas@example.com) and password: 'password123'`);
  process.exit();
}

seed();
