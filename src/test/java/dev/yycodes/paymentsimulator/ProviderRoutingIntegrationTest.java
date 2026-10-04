package dev.yycodes.paymentsimulator;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import dev.yycodes.paymentsimulator.payout.*;
import dev.yycodes.paymentsimulator.provider.*;
import dev.yycodes.paymentsimulator.provider.mastercard.MastercardSendDisbursementsProvider;
import dev.yycodes.paymentsimulator.shared.BadRequestException;
import dev.yycodes.paymentsimulator.shared.ConflictException;
import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest(properties = "payments.reconciliation.enabled=false")
class ProviderRoutingIntegrationTest {
    @Autowired PayoutService payouts;
    @Autowired PayoutProcessor processor;
    @Autowired SimulationController simulation;
    @Autowired PayoutInspectionController inspection;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean MastercardSendDisbursementsProvider mastercard;

    @BeforeEach
    void clean() {
        TestDatabaseCleaner.clean(jdbc);
    }

    CreatePayoutRequest intent(String provider) {
        return new CreatePayoutRequest("seller", new BigDecimal("53.00"), "USD", provider);
    }

    @Test
    void bothProvidersUseTheSameLedgerAndKeepTheirOwnProviderEvidence() {
        when(mastercard.submit(any(), any(), any(), any()))
                .thenReturn(new ProviderResult("sandbox-reference", ProviderStatus.SUCCEEDED));
        var simulated = payouts.create("sim", intent("simulated")).payout();
        var external = payouts.create("mc", intent("mastercard")).payout();
        assertThat(processor.process(simulated.getId()).getStatus())
                .isEqualTo(PayoutStatus.SUCCEEDED);
        assertThat(processor.process(external.getId()).getStatus())
                .isEqualTo(PayoutStatus.SUCCEEDED);
        verify(mastercard, times(1))
                .submit(eq(external.getId()), any(), eq("USD"), eq(SubmissionMode.ORIGINAL));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ledger_transactions", Integer.class))
                .isEqualTo(2);
        assertThat(inspection.snapshot(simulated.getId()).provider()).isNotNull();
        assertThat(inspection.snapshot(external.getId()).provider()).isNull();
        assertThat(inspection.snapshot(external.getId()).payout().provider())
                .isEqualTo("mastercard");
        assertThatThrownBy(
                        () ->
                                simulation.configure(
                                        external.getId(),
                                        new SimulatePayoutRequest(SimulatedOutcome.DECLINED)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void changingProviderCannotReuseAnExistingIdempotencyKey() {
        payouts.create("same-key", intent("simulated"));
        assertThatThrownBy(() -> payouts.create("same-key", intent("mastercard")))
                .isInstanceOf(ConflictException.class);
        verifyNoInteractions(mastercard);
    }

    @Test
    void retryAndReconciliationRouteByStoredProviderEvenWhenTheDefaultIsSimulator() {
        var payout = payouts.create("recover", intent("mastercard")).payout();
        when(mastercard.submit(any(), any(), any(), eq(SubmissionMode.ORIGINAL)))
                .thenThrow(new ProviderTimeoutException("missing reply"));
        when(mastercard.submit(any(), any(), any(), eq(SubmissionMode.RETRY)))
                .thenReturn(new ProviderResult("pending", ProviderStatus.PENDING));
        when(mastercard.findByClientReference(payout.getId()))
                .thenReturn(Optional.of(new ProviderResult("approved", ProviderStatus.SUCCEEDED)));
        assertThat(processor.process(payout.getId()).getStatus()).isEqualTo(PayoutStatus.UNKNOWN);
        assertThat(processor.retry(payout.getId()).getStatus()).isEqualTo(PayoutStatus.UNKNOWN);
        processor.reconcile(payout.getId());
        assertThat(payouts.get(payout.getId()).getStatus()).isEqualTo(PayoutStatus.SUCCEEDED);
        verify(mastercard).findByClientReference(payout.getId());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM provider_transactions", Integer.class))
                .isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ledger_transactions", Integer.class))
                .isEqualTo(1);
    }
}
