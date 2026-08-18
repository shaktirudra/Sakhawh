const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_FILE = path.join(process.cwd(), 'data', 'data.json');

/**
 * Check if text contains order request keywords
 */
function isOrderRequest(text) {
  const orderKeywords = [
    'new order',
    'product name',
    'unit price',
    'quantity',
    'estimated total',
    'dob',
    'customer name',
    'phone number',
    'delivery address'
  ];
  
  const lowerText = text.toLowerCase();
  return orderKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Parse order information from text
 */
function parseOrderInfo(text) {
  const order = {};
  
  // Extract Product Name
  const productMatch = text.match(/Product Name[:\s]+([^\n]+)/i);
  if (productMatch) order.productName = productMatch[1].trim();
  
  // Extract Unit Price
  const priceMatch = text.match(/Unit Price[:\s]+([^\n]+)/i);
  if (priceMatch) order.unitPrice = priceMatch[1].trim();
  
  // Extract Quantity
  const quantityMatch = text.match(/Quantity[:\s]+([^\n]+)/i);
  if (quantityMatch) order.quantity = quantityMatch[1].trim();
  
  // Extract Estimated Total
  const totalMatch = text.match(/Estimated Total[:\s]+([^\n]+)/i);
  if (totalMatch) order.estimatedTotal = totalMatch[1].trim();
  
  // Extract DOB
  const dobMatch = text.match(/DOB[:\s]+([^\n]+)/i);
  if (dobMatch) order.dob = dobMatch[1].trim();
  
  // Extract Customer Name
  const nameMatch = text.match(/Customer Name[:\s]+([^\n]+)/i);
  if (nameMatch) order.customerName = nameMatch[1].trim();
  
  // Extract Phone Number
  const phoneMatch = text.match(/Phone Number[:\s]+([^\n]+)/i);
  if (phoneMatch) order.phoneNumber = phoneMatch[1].trim();
  
  // Extract Delivery Address
  const addressMatch = text.match(/Delivery Address[:\s]+([^\n]+)/i);
  if (addressMatch) order.deliveryAddress = addressMatch[1].trim();
  
  return order;
}

/**
 * Save order to data.json
 */
function saveOrder(order, senderJid) {
  try {
    let data = {};
    
    if (fs.existsSync(DATA_FILE)) {
      const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
      data = JSON.parse(fileContent);
    }
    
    // Initialize orders array if it doesn't exist
    if (!data.orders) {
      data.orders = [];
    }
    
    // Add timestamp and sender info
    const orderWithMetadata = {
      ...order,
      senderJid,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    
    data.orders.push(orderWithMetadata);
    
    // Write back to file
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    
    logger.info(`Order saved: ${order.productName || 'Unknown'} from ${senderJid}`);
    return true;
  } catch (error) {
    logger.error(`Failed to save order: ${error?.message || error}`);
    return false;
  }
}

/**
 * Handle new order request
 */
async function handleOrderRequest(sock, remoteJid, orderText) {
  try {
    // Parse order information
    const order = parseOrderInfo(orderText);
    
    // Validate that we have at least some order info
    if (Object.keys(order).length === 0) {
      return false;
    }
    
    // Save order to data.json
    const saved = saveOrder(order, remoteJid);
    
    if (saved) {
      // Send confirmation message
      const confirmationMessage = `✅ Thanks for this order, our agent will contact you as soon as possible!\n\n📋 Order Summary:\n${Object.entries(order)
        .map(([key, value]) => `• ${key.replace(/([A-Z])/g, ' $1').trim()}: ${value}`)
        .join('\n')}`;
      
      await sock.sendMessage(remoteJid, { text: confirmationMessage });
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error(`Order handling error: ${error?.message || error}`);
    return false;
  }
}

module.exports = { isOrderRequest, handleOrderRequest, parseOrderInfo, saveOrder };
