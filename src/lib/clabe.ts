// CLABE interbancaria: 18 dígitos y el último es dígito verificador (pesos 3, 7, 1).
export function clabeValida(clabe: string) {
  if (!/^\d{18}$/.test(clabe)) return false;
  const pesos = [3, 7, 1];
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += (Number(clabe[i]) * pesos[i % 3]) % 10;
  return (10 - (suma % 10)) % 10 === Number(clabe[17]);
}

export const formatoClabe = (c: string) => c.replace(/^(\d{3})(\d{3})(\d{11})(\d)$/, "$1 $2 $3 $4");
