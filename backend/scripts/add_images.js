require('dotenv').config({ path: __dirname + '/../.env' });
const { supabase } = require('../src/config/supabase');

async function addImages() {
  console.log('Updating images for Mama Joy...');
  await supabase.from('vendors').update({
    cover_image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80'
  }).eq('business_name', "Mama Joy's Kitchen");

  await supabase.from('menu_items').update({
    image_url: 'https://images.unsplash.com/photo-1627308595229-7830f5c90683?w=800&q=80'
  }).eq('name', 'Special Kota');

  await supabase.from('menu_items').update({
    image_url: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80'
  }).eq('name', 'Beef Stew');

  console.log('Updating images for Sipho Shisanyama...');
  await supabase.from('vendors').update({
    cover_image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80'
  }).eq('business_name', 'Sipho Shisanyama');

  await supabase.from('menu_items').update({
    image_url: 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=800&q=80'
  }).eq('name', 'Mixed Braai Plate');

  await supabase.from('menu_items').update({
    image_url: 'https://images.unsplash.com/photo-1588674996954-325d2d480e64?w=800&q=80'
  }).eq('name', 'Wors Roll');

  console.log('Updating images for Gogo\'s Vetkoek...');
  await supabase.from('vendors').update({
    cover_image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=800&q=80'
  }).eq('business_name', "Gogo's Vetkoek");

  await supabase.from('menu_items').update({
    image_url: 'https://images.unsplash.com/photo-1579697096985-41fe1430e5d6?w=800&q=80'
  }).eq('name', 'Magwinya & Polony');

  await supabase.from('menu_items').update({
    image_url: 'https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?w=800&q=80'
  }).eq('name', 'Mince Magwinya');

  console.log('✅ Added all images to database.');
  process.exit();
}

addImages();
