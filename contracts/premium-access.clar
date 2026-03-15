(define-constant ERR-NOT-AUTHORIZED (err u100))

(define-data-var contract-owner principal tx-sender)

(define-map access-grants
  {
    resource-id: (string-ascii 64),
    who: principal
  }
  {
    granted-at: uint,
    granted-by: principal
  }
)

(define-private (is-owner)
  (is-eq tx-sender (var-get contract-owner))
)

(define-public (grant-access (resource-id (string-ascii 64)) (recipient principal))
  (if (is-owner)
    (let
      (
        (grant-record {
          granted-at: stacks-block-height,
          granted-by: tx-sender
        })
      )
      (begin
        (map-set access-grants
          {
            resource-id: resource-id,
            who: recipient
          }
          grant-record
        )
        (print {
          event: "premium-access-granted",
          resource-id: resource-id,
          recipient: recipient,
          granted-at: stacks-block-height
        })
        (ok grant-record)
      )
    )
    ERR-NOT-AUTHORIZED
  )
)

(define-public (revoke-access (resource-id (string-ascii 64)) (recipient principal))
  (if (is-owner)
    (begin
      (map-delete access-grants
        {
          resource-id: resource-id,
          who: recipient
        }
      )
      (print {
        event: "premium-access-revoked",
        resource-id: resource-id,
        recipient: recipient,
        revoked-at: stacks-block-height
      })
      (ok true)
    )
    ERR-NOT-AUTHORIZED
  )
)

(define-read-only (has-access (resource-id (string-ascii 64)) (who principal))
  (is-some
    (map-get? access-grants
      {
        resource-id: resource-id,
        who: who
      }
    )
  )
)

(define-read-only (get-access-grant (resource-id (string-ascii 64)) (who principal))
  (map-get? access-grants
    {
      resource-id: resource-id,
      who: who
    }
  )
)

(define-read-only (get-owner)
  (var-get contract-owner)
)
