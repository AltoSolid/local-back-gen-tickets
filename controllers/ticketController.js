const Ticket = require('../models/Ticket');
const TicketNumber = require('../models/TicketNumber'); // Asegúrate de que esta línea esté presente
const { createTicketBuffers } = require('../utils/ticketUtils');
const QRCode = require('qrcode');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Configuración de nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ORGANIZER_EMAIL,
    pass: process.env.EMAIL_PASS,
  },
});

// Obtener los últimos números de boletas
exports.getLastTickets = async (req, res) => {
  try {
    const tickets = await TicketNumber.find();
    const ticketTypes = ['A', 'B', 'C', 'D'];
    const formattedTickets = {};

    ticketTypes.forEach((type) => {
      const ticket = tickets.find((t) => t.ticketType === type);
      formattedTickets[type] = ticket
        ? `${ticket.ticketType}${String(ticket.lastNumber).padStart(3, '0')}`
        : `${type}---`;
    });

    res.json(formattedTickets);
  } catch (error) {
    console.error('Error al obtener los números de boletas:', error);
    res.status(500).json({ success: false, message: 'Error al obtener los números de boletas' });
  }
};

// Generar una nueva boleta
exports.generateTicket = async (req, res) => {
  const { name, email, phone, ticketType } = req.body;

  try {
    // Obtener y actualizar el último número de boleta
    let ticketNumberRecord = await TicketNumber.findOne({ ticketType });
    if (!ticketNumberRecord) {
      ticketNumberRecord = new TicketNumber({ ticketType, lastNumber: 0 });
    }

    ticketNumberRecord.lastNumber += 1;
    await ticketNumberRecord.save();

    const ticketNumber = `${ticketType}${String(ticketNumberRecord.lastNumber).padStart(3, '0')}`;
    const uniqueCode = crypto.createHash('sha256').update(ticketNumber + Date.now().toString()).digest('hex');

    // Generar el QR
    const qrData = JSON.stringify({ ticketId: ticketNumber, name, uniqueCode });
    const qrCodeUrl = await QRCode.toDataURL(qrData);

    // Generar los buffers para el PDF y la imagen JPEG
    const { pdfBuffer, jpegBuffer } = await createTicketBuffers(ticketType, ticketNumber, qrCodeUrl);

    console.log('Buffers generados:', {
      pdfBufferLength: pdfBuffer.length,
      jpegBufferLength: jpegBuffer.length,
    });

    // Guardar en la base de datos
    const ticket = new Ticket({
      name,
      email,
      phone,
      ticketType,
      ticketId: ticketNumber,
      hash: uniqueCode,
      remainingUses: ticketType === 'A' ? 1 : 2, // Boleta A tiene 1 uso, B y C tienen 2
      scanDates: [], // Inicialmente vacío
    });
    await ticket.save();

    console.log(`Boleta guardada en la base de datos: ${ticketNumber}`);

    // Enviar correos
    const mailOptionsClient = {
      from: process.env.ORGANIZER_EMAIL,
      to: email,
      subject: 'FESTIVAL COREANO - boleta',
      text: `Hola ${name},\n\nMuchas gracias por confiar en nosotros!\n\nAquí está tu boleta: ${ticketNumber}\n\nRecuerda que debes presentar en la entrada del evento esta boleta.\nNo la compartas con nadie ya que es solo para ti.`,
      attachments: [
        { filename: `boleta-${ticketNumber}.pdf`, content: pdfBuffer }, // PDF adjunto
        { filename: `boleta-${ticketNumber}.jpeg`, content: jpegBuffer }, // Imagen adjunta
      ],
    };

    const mailOptionsOrganizer = {
      from: process.env.ORGANIZER_EMAIL,
      to: process.env.ORGANIZER_EMAIL,
      subject: `Nueva Boleta Generada: ${ticketNumber}`,
      text: `Boleta generada:\nNombre: ${name}\nEmail: ${email}\nTeléfono: ${phone}\nBoleta: ${ticketNumber}\nFirma Digital: ${uniqueCode}`,
      attachments: [
        { filename: `boleta-${ticketNumber}.pdf`, content: pdfBuffer }, // PDF adjunto
        { filename: `boleta-${ticketNumber}.jpeg`, content: jpegBuffer }, // Imagen adjunta
      ],
    };

    // Enviar correos
    await transporter.sendMail(mailOptionsClient);
    await transporter.sendMail(mailOptionsOrganizer);

    res.json({ success: true, ticketNumber });
  } catch (error) {
    console.error('Error al generar la boleta:', error);
    res.status(500).json({ success: false, message: 'Error al generar la boleta' });
  }
};

