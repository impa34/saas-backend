export const getPurchaseEmail = (username, plan) => {
  const details = {
    Pro: `
      - ✅ Personalización del chatbot (colores, fuentes, saludo)<br/>
      - 📊 Acceso a estadísticas de uso
    `,
    Full: `
      - ✅ Todo lo incluido en PRO<br/>
      - 📥 Descarga del historial de conversaciones<br/>
      - 📅 Integración con Google Calendar<br/>
      - 📊 Soporte para archivos Excel
    `,
  };

  return `
    <h2>¡Gracias por tu compra, ${username}!</h2>
    <p>Has adquirido el plan <strong>${plan}</strong>. Ahora tienes acceso a:</p>
    <p>${details[plan]}</p>
    <p>¡Esperamos que disfrutes de todas las ventajas!</p>
    <br/>
    <p>— El equipo de TuApp</p>
  `;
};

export const getCancelationEmail = (username) => {
  return `
    <h2>Suscripción cancelada</h2>
    <p>Hola ${username},</p>
    <p>Tu suscripción ha sido cancelada y has vuelto al plan Free.</p>
    <p>Agradecemos que hayas probado una suscripción premium y esperamos verte de vuelta pronto.</p>
    <br/>
    <p>— El equipo de TuApp</p>
  `;
};
