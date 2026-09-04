// Muestra el teléfono con el signo "+" adelante (ej: "543834235163" -> "+543834235163").
export const formatPhone = (phone) => {
  if (!phone) return phone;
  const clean = phone.toString().trim();
  return clean.startsWith('+') ? clean : `+${clean}`;
};
