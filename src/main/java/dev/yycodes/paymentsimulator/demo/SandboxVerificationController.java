package dev.yycodes.paymentsimulator.demo;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/sandbox-verification")
public class SandboxVerificationController {
    private final SandboxVerification verification;

    public SandboxVerificationController(SandboxVerification verification) {
        this.verification = verification;
    }

    @GetMapping
    public State state() {
        return new State(verification.required(), verification.siteKey(), verification.verified());
    }

    @PostMapping
    public State verify(@RequestBody Token token) {
        verification.verify(token.token());
        return state();
    }

    public record State(boolean required, String siteKey, boolean verified) {}

    public record Token(String token) {}
}
