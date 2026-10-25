param([switch]$ConfirmCurrentUserTrust)
# Retained only so a command from an older README cannot change Windows trust.
Write-Output 'Operacion retirada: V11_1.1 usa HTTP exclusivamente en 127.0.0.1:25443. No se instala ningun certificado ni se modifica Windows, incluso con el argumento antiguo.'
exit 1
