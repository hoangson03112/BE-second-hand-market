class SuccessResponse {
  constructor({ message, data = {}, statusCode = 200 }) {
    this.status = "success";
    this.message = message;
    this.data = data;
    this.statusCode = statusCode;
  }

  send(res) {
    return res.status(this.statusCode).json(this);
  }
}

class CreatedResponse extends SuccessResponse {
  constructor({ message = "Created successfully", data = {} }) {
    super({ message, data, statusCode: 201 });
  }
}

class OKResponse extends SuccessResponse {
  constructor({ message = "Success", data = {} }) {
    super({ message, data, statusCode: 200 });
  }
}

module.exports = {
  SuccessResponse,
  CreatedResponse,
  OKResponse
};