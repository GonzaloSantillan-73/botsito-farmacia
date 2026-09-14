// Muestra el teléfono con el signo "+" adelante (ej: "543834235163" -> "+543834235163").
export const formatPhone = (phone) => {
  console.log('🔍 [DEBUG-LIB-FORMATPHONE] formatPhone() — input:', phone);
  if (!phone) {
    console.log('✅ [DEBUG-LIB-FORMATPHONE] formatPhone() — return (input vacío):', phone);
    return phone;
  }
  const clean = phone.toString().trim();
  const result = clean.startsWith('+') ? clean : `+${clean}`;
  console.log('✅ [DEBUG-LIB-FORMATPHONE] formatPhone() — return:', result);
  return result;
};
