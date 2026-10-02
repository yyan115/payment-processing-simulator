package dev.yycodes.paymentsimulator.demo;

import dev.yycodes.paymentsimulator.provider.ProviderCatalog;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class DemoController {
    private final DemoWorkspace workspace;
    private final ProviderCatalog providers;
    private final boolean automaticReconciliation;

    public DemoController(
            DemoWorkspace workspace,
            ProviderCatalog providers,
            @Value("${payments.reconciliation.enabled:true}") boolean automaticReconciliation) {
        this.workspace = workspace;
        this.providers = providers;
        this.automaticReconciliation = automaticReconciliation;
    }

    @PostMapping("/workspace")
    public DemoWorkspace.Workspace open(
            HttpServletRequest request,
            HttpServletResponse response,
            @RequestParam(defaultValue = "false") boolean reset) {
        return workspace.open(request, response, reset);
    }

    @GetMapping("/config")
    public Configuration configuration() {
        return new Configuration(
                providers.defaultProvider(),
                automaticReconciliation,
                providers.mastercardAvailable(),
                providers.visaAvailable(),
                workspace.enabled());
    }

    public record Configuration(
            String defaultProvider,
            boolean automaticReconciliation,
            boolean mastercardAvailable,
            boolean visaAvailable,
            boolean temporaryWorkspaces) {}
}
