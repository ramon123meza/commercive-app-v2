export function generateStoreCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  
  for (let i = 0; i < 8; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }
  
  return code;
}

export function validateStoreCode(code: string): boolean {
  const pattern = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
  return pattern.test(code);
}
