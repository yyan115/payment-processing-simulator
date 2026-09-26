package dev.yycodes.paymentsimulator.payout;

import dev.yycodes.paymentsimulator.shared.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

@Service
public class PayoutStateService {
    private final PayoutRepository repository;
    public PayoutStateService(PayoutRepository repository) { this.repository = repository; }

    @Transactional
    public Payout markProcessing(UUID id) {
        Payout p = require(id);
        p.startProcessing();
        return repository.saveAndFlush(p);
    }

    @Transactional
    public Payout markSucceeded(UUID id, String ref) {
        Payout p = require(id);
        p.markSucceeded(ref);
        return repository.saveAndFlush(p);
    }

    @Transactional
    public Payout markFailed(UUID id, String ref) {
        Payout p = require(id);
        p.markFailed(ref);
        return repository.saveAndFlush(p);
    }

    @Transactional
    public Payout markUnknown(UUID id) {
        Payout p = require(id);
        p.markUnknown();
        return repository.saveAndFlush(p);
    }

    @Transactional(readOnly = true)
    public Payout get(UUID id) { return require(id); }

    private Payout require(UUID id) {
        return repository.findById(id).orElseThrow(() -> new NotFoundException("Payout " + id + " was not found"));
    }
}
