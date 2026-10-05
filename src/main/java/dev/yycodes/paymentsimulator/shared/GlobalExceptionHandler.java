package dev.yycodes.paymentsimulator.shared;

import dev.yycodes.paymentsimulator.demo.DemoException;
import dev.yycodes.paymentsimulator.provider.ProviderRejectedException;
import dev.yycodes.paymentsimulator.provider.ProviderTimeoutException;
import java.time.Instant;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Maps exceptions to API error responses. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(DemoException.class)
    ResponseEntity<ApiError> demo(DemoException e) {
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
        return error(
                HttpStatus.CONFLICT,
                "The payout changed at the same time. Reload it and try again");
    }

    @ExceptionHandler(ProviderTimeoutException.class)
    ResponseEntity<ApiError> providerUnavailable(ProviderTimeoutException ignored) {
        return error(
                HttpStatus.SERVICE_UNAVAILABLE,
                "The payment network is temporarily unavailable. The payout keeps its state");
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
