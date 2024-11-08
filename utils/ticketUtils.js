const { createCanvas, loadImage } = require('canvas');
const PDFDocument = require('pdfkit');
const path = require('path');

exports.createTicketBuffers = async (ticketType, ticketNumber, qrCodeUrl) => {
  const templatePath = path.join(__dirname, '../templates', `ticket-${ticketType.toLowerCase()}.jpeg`);
  const canvas = createCanvas(1080, 540);
  const context = canvas.getContext('2d');

  // Cargar la plantilla
  const template = await loadImage(templatePath);
  context.drawImage(template, 0, 0, canvas.width, canvas.height);

  // Dibujar el número de boleta en la plantilla
  context.font = 'bold 30px Arial';
  context.fillStyle = 'black';
  context.textAlign = 'center';
  context.fillText(ticketNumber, 920, 280); // Encima del QR
  context.fillStyle = 'white';
  context.fillText(ticketNumber, 550, 480); // Dentro del cuadro azul

  // Dibujar el QR
  const qrImage = await loadImage(qrCodeUrl);
  context.drawImage(qrImage, 850, 320, 180, 180); // En el cuadro gris

  // Generar la imagen JPEG en memoria
  const jpegBuffer = canvas.toBuffer('image/jpeg');

  // Generar el PDF en memoria
  const pdfDoc = new PDFDocument({ size: [canvas.width, canvas.height] });
  const pdfBuffers = [];

  return new Promise((resolve, reject) => {
    pdfDoc.on('data', (chunk) => pdfBuffers.push(chunk));
    pdfDoc.on('end', () => {
      const pdfBuffer = Buffer.concat(pdfBuffers);
      resolve({ pdfBuffer, jpegBuffer });
    });
    pdfDoc.on('error', (err) => reject(err));

    // Insertar la imagen generada (JPEG) al PDF
    pdfDoc.image(jpegBuffer, 0, 0, { width: canvas.width, height: canvas.height });
    pdfDoc.end();
  });
};
