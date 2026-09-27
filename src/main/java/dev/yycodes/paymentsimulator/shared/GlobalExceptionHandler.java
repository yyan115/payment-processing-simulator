package dev.yycodes.paymentsimulator.shared;

import dev.yycodes.paymentsimulator.provider.ProviderRejectedException;
import dev.yycodes.paymentsimulator.provider.ProviderTimeoutException;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(dev.yycodes.paymentsimulator.demo.DemoException.class)
    ResponseEntity<ApiError> demo(dev.yycodes.paymentsimulator.demo.DemoException e) {
        return error(HttpStatus.valueOf(e.status()), e.getMessage());
    }

    @ExceptionHandler(BadRequestException.class)
    ResponseEntity<ApiError> badRequest(BadRequestException e) {
        return error(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    @ExceptionHandler(NotFoundException.class)
    ResponseEntity<ApiError> notFound(NotFoundException e) {
        return error(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(ConflictException.class)
    ResponseEntity<ApiError> conflict(ConflictException e) {
        return error(HttpStatus.CONFLICT, e.getMessage());
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    ResponseEntity<ApiError> optimisticConflict(OptimisticLockingFailureException ignored) {
        return error(HttpStatus.CONFLICT, "Payout state changed concurrently; reload and retry");
    }

    @ExceptionHandler(ProviderTimeoutException.class)
    ResponseEntity<ApiError> providerUnavailable(ProviderTimeoutException ignored) {
        return error(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Payment provider is temporarily unavailable; payout state was preserved");
    }

    @ExceptionHandler(ProviderRejectedException.class)
    ResponseEntity<ApiError> providerIntegrationRejected(ProviderRejectedException e) {
        return error(
                HttpStatus.BAD_GATEWAY,
                "Payment provider rejected the integration request with HTTP " + e.getStatusCode());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> validation(MethodArgumentNotValidException e) {
        String message =
                e.getBindingResult().getFieldErrors().stream()
                        .findFirst()
                        .map(error -> error.getField() + ": " + error.getDefaultMessage())
                        .orElse("Request validation failed");

        return error(HttpStatus.BAD_REQUEST, message);
    }

    private ResponseEntity<ApiError> error(HttpStatus status, String message) {
        return ResponseEntity.status(status)
                .body(
                        new ApiError(
                                Instant.now(), status.value(), status.getReasonPhrase(), message));
    }
}
