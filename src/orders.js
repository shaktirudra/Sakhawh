const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_FILE = path.join(process.cwd(), 'data', 'data.json');

/**
 * Check if text contains order request keywords
 */
function isOrderRequest(text) {
  if (!text || typeof text !== 'string') return false;
  
  const lowerText = text.toLowerCase();
  
  // Check for "New Order Request" header
  if (lowerText.includes('new order')) {
    return true;
  }
  
  // Check for order fields pattern
  const orderFields = [
    'product name',
    'unit price',
    'quantity',
    'customer name',
    'phone number',
    'delivery address'
  ];
  
  // Count how many order fields are present
  const fieldCount = orderFields.filter(field => lowerText.includes(field)).length;
  
  // If at least 3 order fields are detected, treat as order request
  return fieldCount >= 3;
}

/**
 * Parse order information from text
 */
function parseOrderInfo(text) {
  const order = {};
  
  if (!text || typeof text !== 'string') return order;
  
  // Extract Product Name
  const productMatch = text.match(/Product\s+Name\s*:\s*([^\n]+)/i);
  if (productMatch) order.productName = productMatch[1].trim();
  
  // Extract Unit Price
  const priceMatch = text.match(/Unit\s+Price\s*:\s*([^\n]+)/i);
  if (priceMatch) order.unitPrice = priceMatch[1].trim();
  
  // Extract Quantity
  const quantityMatch = text.match(/Quantity\s*:\s*([^\n]+)/i);
  if (quantityMatch) order.quantity = quantityMatch[1].trim();
  
  // Extract Estimated Total
  const totalMatch = text.match(/Estimated\s+Total\s*:\s*([^\n]+)/i);
  if (totalMatch) order.estimatedTotal = totalMatch[1].trim();
  
  // Extract DOB
  const dobMatch = text.match(/DOB\s*:\s*([^\n]+)/i);
  if (dobMatch) order.dob = dobMatch[1].trim();
  
  // Extract Customer Name
  const nameMatch = text.match(/Customer\s+Name\s*:\s*([^\n]+)/i);
  if (nameMatch) order.customerName = nameMatch[1].trim();
  
  // Extract Phone Number
  const phoneMatch = text.match(/Phone\s+Number\s*:\s*([^\n]+)/i);
  if (phoneMatch) order.phoneNumber = phoneMatch[1].trim();
  
  // Extract Delivery Address
  const addressMatch = text.match(/Delivery\s+Address\s*:\s*([^\n]+)/i);
  if (addressMatch) order.deliveryAddress = addressMatch[1].trim();
  
  logger.info(`Parsed order fields: ${Object.keys(order).length} - ${JSON.stringify(order)}`);
  
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
    
    logger.info(`✅ Order saved: ${order.productName || 'Unknown'} from ${senderJid}`);
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
    logger.info('🛍️ Processing order request...');
    
    // Parse order information
    const order = parseOrderInfo(orderText);
    
    // Validate that we have at least some critical order info
    const hasMinimumInfo = order.productName || order.customerName || order.phoneNumber;
    
    if (!hasMinimumInfo) {
      logger.warn('⚠️ Order detected but missing critical information');
      return false;
    }
    
    logger.info(`📦 Order contains: ${Object.keys(order).join(', ')}`);
    
    // Save order to data.json
    const saved = saveOrder(order, remoteJid);
    
    if (saved) {
      // Send confirmation message
      const confirmationMessage = `✅ Thanks for this order, our agent will contact you as soon as possible!\n\n📋 Order Summary:\n${Object.entries(order)
        .map(([key, value]) => {
          const formattedKey = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
          return `• ${formattedKey}: ${value}`;
        })
        .join('\n')}`;
      
      await sock.sendMessage(remoteJid, { text: confirmationMessage });
      logger.info('📤 Confirmation message sent');
      return true;
    }
    
    logger.error('❌ Failed to save order');
    return false;
  } catch (error) {
    logger.error(`Order handling error: ${error?.message || error}`);
    return false;
  }
}

module.exports = { isOrderRequest, handleOrderRequest, parseOrderInfo, saveOrder };
