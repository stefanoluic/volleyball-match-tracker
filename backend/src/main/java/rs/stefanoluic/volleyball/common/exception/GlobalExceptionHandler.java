package rs.stefanoluic.volleyball.common.exception;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.LinkedHashMap;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiError> handleApi(ApiException exception) {
        return ResponseEntity.status(exception.getStatus()).body(new ApiError(exception.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception) {
        var errors = new LinkedHashMap<String, String>();
        exception.getBindingResult().getFieldErrors().forEach(
                error -> errors.putIfAbsent(error.getField(), error.getDefaultMessage()));
        return ResponseEntity.badRequest().body(new ApiError("Proverite unete podatke.", errors));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<ApiError> handleInvalidInput(Exception exception) {
        return ResponseEntity.badRequest().body(new ApiError("Zahtev sadrži neispravne podatke."));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiError> handleConflict(DataIntegrityViolationException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ApiError("Podaci su u sukobu sa postojećim zapisom."));
    }
}
