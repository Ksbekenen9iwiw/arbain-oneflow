class BusinessError(Exception):
    def __init__(self, code, message):
        self.code = code
        self.message = message
        super().__init__(message)

    @property
    def status_code(self):
        if self.code == 'FORBIDDEN':
            return 403
        return 400 if self.code == 'INVALID_INPUT' else 409
