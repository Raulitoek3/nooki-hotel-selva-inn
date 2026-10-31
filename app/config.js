// Datos de conexión y marca del hotel. La llave "publishable" es pública por diseño:
// va en el navegador y solo deja hacer lo que permiten las reglas (RLS).
// NUNCA poner aquí la llave service_role ni secretos de facturación.
window.CONFIG_HOTEL = {
  hotel: 'Hotel Selva Inn',
  lugar: 'Puerto Maldonado · Perú',
  supabaseUrl: 'https://cuwfogndinvrjszsbcpc.supabase.co',
  supabaseKey: 'sb_publishable_C_QtHgSKovefzFC5apapeg_J4r0JSTi'
};
