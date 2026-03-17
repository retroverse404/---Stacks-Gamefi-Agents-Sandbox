(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-TOKEN-NOT-FOUND (err u101))

(define-data-var contract-owner principal tx-sender)
(define-data-var last-token-id uint u0)

(define-non-fungible-token floppy-disk uint)

(define-map token-uris
  { token-id: uint }
  { uri: (string-ascii 256) }
)

(define-private (is-owner)
  (is-eq tx-sender (var-get contract-owner))
)

(define-private (token-exists (token-id uint))
  (is-some (nft-get-owner? floppy-disk token-id))
)

(define-public (mint (recipient principal) (token-uri (optional (string-ascii 256))))
  (if (is-owner)
    (let
      (
        (next-token-id (+ (var-get last-token-id) u1))
      )
      (begin
        (try! (nft-mint? floppy-disk next-token-id recipient))
        (var-set last-token-id next-token-id)
        (match token-uri
          uri (map-set token-uris { token-id: next-token-id } { uri: uri })
          true
        )
        (print {
          event: "floppy-disk-minted",
          token-id: next-token-id,
          recipient: recipient
        })
        (ok next-token-id)
      )
    )
    ERR-NOT-AUTHORIZED
  )
)

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (if (is-eq tx-sender sender)
    (begin
      (try! (nft-transfer? floppy-disk token-id sender recipient))
      (print {
        event: "floppy-disk-transferred",
        token-id: token-id,
        sender: sender,
        recipient: recipient
      })
      (ok true)
    )
    ERR-NOT-AUTHORIZED
  )
)

(define-public (set-token-uri (token-id uint) (uri (string-ascii 256)))
  (if (is-owner)
    (if (token-exists token-id)
      (begin
        (map-set token-uris { token-id: token-id } { uri: uri })
        (print {
          event: "floppy-disk-uri-set",
          token-id: token-id
        })
        (ok true)
      )
      ERR-TOKEN-NOT-FOUND
    )
    ERR-NOT-AUTHORIZED
  )
)

(define-read-only (get-last-token-id)
  (var-get last-token-id)
)

(define-read-only (get-token-uri (token-id uint))
  (match (map-get? token-uris { token-id: token-id })
    record (some (get uri record))
    none
  )
)

(define-read-only (get-owner (token-id uint))
  (nft-get-owner? floppy-disk token-id)
)

(define-read-only (get-owner-principal)
  (var-get contract-owner)
)
