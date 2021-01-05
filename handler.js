"use strict";
const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const util = require("util");
const {
  saveCompletedOrder,
  deliverOrder,
  getOrder,
} = require("./ordermetadataManager");

const sqs = new AWS.SQS({ region: process.env.REGION });
const QUEUE_URL = process.env.PENDING_ORDER_QUEUE;

module.exports.hacerPedido = (event, context, callback) => {
  console.log(util.inspect(event));
  const body = { ...JSON.parse(event.body) };
  const { name, address, pizzas } = body;
  const orderId = uuidv4();

  const order = {
    orderId: orderId,
    name: name,
    address: address,
    pizzas: pizzas,
    timestamp: Date.now(),
  };

  const params = {
    MessageBody: JSON.stringify(order),
    QueueUrl: QUEUE_URL,
  };

  sqs.sendMessage(params, function (err, data) {
    if (err) {
      sendResponse(500, err, callback);
    } else {
      const message = {
        order: order,
        messageId: data.MessageId,
      };
      sendResponse(200, message, callback);
    }
  });
};

module.exports.prepararPedido = async (event, context, callback) => {
  console.log(util.inspect(event));
  console.log("Preparar pedido fue llamada");

  const order = JSON.parse(event.Records[0].body);

  let ordersaved;
  try {
    ordersaved = await saveCompletedOrder(order);
    callback();
  } catch (error) {
    callback(error);
  }
};

module.exports.enviarPedido = async (event, context, callback) => {
  console.log(util.inspect(event));
  console.log("enviarPedido fue llamada");

  const record = event.Records[0];
  // console.log(record.dynamodb);

  if (record.eventName === "INSERT") {
    console.log("deliverOrder");

    const orderId = record.dynamodb.Keys.orderId.S;

    let orderDelivered;
    try {
      orderDelivered = await deliverOrder(orderId);
      console.log(orderDelivered);
      callback();
    } catch (error) {
      callback(error);
    }
  } else {
    console.log("is not a new record");
    callback();
  }
};

module.exports.estadoPedido = (event, context, callback) => {
  console.log("Estado pedido fue llamado");

  const orderId = event.pathParameters && event.pathParameters.orderId;
  if (orderId !== null) {
    getOrder(orderId)
      .then((order) => {
        sendResponse(
          200,
          `El estado de la orden: ${orderId} es ${order.delivery_status}`,
          callback
        );
      })
      .catch((error) => {
        sendResponse(500, "Hubo un error al procesar el pedido", callback);
      });
  } else {
    sendResponse(400, "Falta el orderId", callback);
  }
};

function sendResponse(statusCode, message, callback) {
  const response = {
    statusCode: statusCode,
    body: JSON.stringify(message),
  };
  callback(null, response);
}
