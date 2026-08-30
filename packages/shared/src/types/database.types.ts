export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activity_log: {
        Row: {
          actor: string
          color: string
          commune_id: string | null
          created_at: string
          id: string
          organization_id: string | null
          text: string
        }
        Insert: {
          actor: string
          color?: string
          commune_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          text: string
        }
        Update: {
          actor?: string
          color?: string
          commune_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "communes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          field: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          source: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          source?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          source?: string
        }
        Relationships: []
      }
      communes: {
        Row: {
          contact_email: string | null
          created_at: string
          email_notif: boolean
          id: string
          name: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          email_notif?: boolean
          id?: string
          name: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          email_notif?: boolean
          id?: string
          name?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          subject: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          subject: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          subject?: string
        }
        Relationships: []
      }
      external_ids: {
        Row: {
          created_at: string
          external_id: string
          id: string
          park_id: string
          provider: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          park_id: string
          provider: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          park_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_ids_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ids_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      features: {
        Row: {
          category: Database["public"]["Enums"]["feature_category"]
          code: string
          created_at: string
          icon_key: string | null
          id: string
          is_active: boolean
          label_key: string
          sort_order: number
          value_set: string[] | null
        }
        Insert: {
          category: Database["public"]["Enums"]["feature_category"]
          code: string
          created_at?: string
          icon_key?: string | null
          id?: string
          is_active?: boolean
          label_key: string
          sort_order?: number
          value_set?: string[] | null
        }
        Update: {
          category?: Database["public"]["Enums"]["feature_category"]
          code?: string
          created_at?: string
          icon_key?: string | null
          id?: string
          is_active?: boolean
          label_key?: string
          sort_order?: number
          value_set?: string[] | null
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          name: string
          status: string
        }
        Insert: {
          group_id: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          group_id?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string
          id: string
          park_id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by: string
          id?: string
          park_id: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string
          id?: string
          park_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance: {
        Row: {
          assignee: string | null
          commune_id: string
          created_at: string
          date: string
          done: boolean
          done_date: string | null
          equipment_id: string | null
          id: string
          note: string | null
          organization_id: string
          park_id: string
          recur: Database["public"]["Enums"]["maintenance_recur"]
          zone_id: string | null
        }
        Insert: {
          assignee?: string | null
          commune_id: string
          created_at?: string
          date: string
          done?: boolean
          done_date?: string | null
          equipment_id?: string | null
          id?: string
          note?: string | null
          organization_id: string
          park_id: string
          recur?: Database["public"]["Enums"]["maintenance_recur"]
          zone_id?: string | null
        }
        Update: {
          assignee?: string | null
          commune_id?: string
          created_at?: string
          date?: string
          done?: boolean
          done_date?: string | null
          equipment_id?: string | null
          id?: string
          note?: string | null
          organization_id?: string
          park_id?: string
          recur?: Database["public"]["Enums"]["maintenance_recur"]
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "communes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "park_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "park_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          description: string
          id: string
          park_id: string | null
          read: boolean
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          park_id?: string | null
          read?: boolean
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          park_id?: string | null
          read?: boolean
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_parks: {
        Row: {
          created_at: string
          organization_id: string
          park_id: string
          role: Database["public"]["Enums"]["organization_park_role"]
          verified: boolean
        }
        Insert: {
          created_at?: string
          organization_id: string
          park_id: string
          role?: Database["public"]["Enums"]["organization_park_role"]
          verified?: boolean
        }
        Update: {
          created_at?: string
          organization_id?: string
          park_id?: string
          role?: Database["public"]["Enums"]["organization_park_role"]
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "organization_parks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_parks_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_parks_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          contact_email: string | null
          country_code: string | null
          created_at: string
          email_notif: boolean
          id: string
          name: string
          type: Database["public"]["Enums"]["organization_type"]
          updated_at: string
          verified: boolean
          website: string | null
        }
        Insert: {
          contact_email?: string | null
          country_code?: string | null
          created_at?: string
          email_notif?: boolean
          id?: string
          name: string
          type?: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
          verified?: boolean
          website?: string | null
        }
        Update: {
          contact_email?: string | null
          country_code?: string | null
          created_at?: string
          email_notif?: boolean
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
          verified?: boolean
          website?: string | null
        }
        Relationships: []
      }
      park_attribute_sources: {
        Row: {
          attribute_key: string
          confidence: number | null
          created_at: string
          id: string
          is_current: boolean
          park_id: string
          source_id: string | null
          value_json: Json
          verified_at: string | null
        }
        Insert: {
          attribute_key: string
          confidence?: number | null
          created_at?: string
          id?: string
          is_current?: boolean
          park_id: string
          source_id?: string | null
          value_json: Json
          verified_at?: string | null
        }
        Update: {
          attribute_key?: string
          confidence?: number | null
          created_at?: string
          id?: string
          is_current?: boolean
          park_id?: string
          source_id?: string | null
          value_json?: Json
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "park_attribute_sources_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_attribute_sources_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_attribute_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "park_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      park_duplicate_candidates: {
        Row: {
          address_similarity: number | null
          candidate_park_id: string
          created_at: string
          external_id_match: boolean
          geo_distance_m: number | null
          geo_distance_score: number | null
          id: string
          name_similarity: number | null
          park_id: string
          resolution: string
          resolved_at: string | null
          resolved_by: string | null
          total_score: number | null
        }
        Insert: {
          address_similarity?: number | null
          candidate_park_id: string
          created_at?: string
          external_id_match?: boolean
          geo_distance_m?: number | null
          geo_distance_score?: number | null
          id?: string
          name_similarity?: number | null
          park_id: string
          resolution?: string
          resolved_at?: string | null
          resolved_by?: string | null
          total_score?: number | null
        }
        Update: {
          address_similarity?: number | null
          candidate_park_id?: string
          created_at?: string
          external_id_match?: boolean
          geo_distance_m?: number | null
          geo_distance_score?: number | null
          id?: string
          name_similarity?: number | null
          park_id?: string
          resolution?: string
          resolved_at?: string | null
          resolved_by?: string | null
          total_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "park_duplicate_candidates_candidate_park_id_fkey"
            columns: ["candidate_park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_duplicate_candidates_candidate_park_id_fkey"
            columns: ["candidate_park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_duplicate_candidates_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_duplicate_candidates_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      park_edit_history: {
        Row: {
          action: string
          actor: string
          created_at: string
          id: string
          note: string | null
          park_id: string
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          id?: string
          note?: string | null
          park_id: string
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          id?: string
          note?: string | null
          park_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "park_edit_history_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_edit_history_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      park_edits: {
        Row: {
          changes: Json
          created_at: string
          id: string
          organization_id: string | null
          park_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["edit_status"]
          user_id: string | null
        }
        Insert: {
          changes: Json
          created_at?: string
          id?: string
          organization_id?: string | null
          park_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["edit_status"]
          user_id?: string | null
        }
        Update: {
          changes?: Json
          created_at?: string
          id?: string
          organization_id?: string | null
          park_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["edit_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "park_edits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_edits_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_edits_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      park_entrances: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          location: unknown
          name: string | null
          park_id: string
          type: Database["public"]["Enums"]["entrance_type"]
          wheelchair_access: Database["public"]["Enums"]["access_level"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          location: unknown
          name?: string | null
          park_id: string
          type?: Database["public"]["Enums"]["entrance_type"]
          wheelchair_access?: Database["public"]["Enums"]["access_level"]
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          location?: unknown
          name?: string | null
          park_id?: string
          type?: Database["public"]["Enums"]["entrance_type"]
          wheelchair_access?: Database["public"]["Enums"]["access_level"]
        }
        Relationships: [
          {
            foreignKeyName: "park_entrances_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_entrances_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      park_equipment: {
        Row: {
          condition: Database["public"]["Enums"]["equipment_condition"] | null
          created_at: string
          feature_id: string | null
          id: string
          installation_date: string | null
          last_inspection_at: string | null
          location: unknown
          manufacturer: string | null
          model: string | null
          name: string | null
          next_inspection_at: string | null
          park_id: string
          quantity: number
          status: Database["public"]["Enums"]["equipment_status"]
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          condition?: Database["public"]["Enums"]["equipment_condition"] | null
          created_at?: string
          feature_id?: string | null
          id?: string
          installation_date?: string | null
          last_inspection_at?: string | null
          location?: unknown
          manufacturer?: string | null
          model?: string | null
          name?: string | null
          next_inspection_at?: string | null
          park_id: string
          quantity?: number
          status?: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          condition?: Database["public"]["Enums"]["equipment_condition"] | null
          created_at?: string
          feature_id?: string | null
          id?: string
          installation_date?: string | null
          last_inspection_at?: string | null
          location?: unknown
          manufacturer?: string | null
          model?: string | null
          name?: string | null
          next_inspection_at?: string | null
          park_id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "park_equipment_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_equipment_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_equipment_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_equipment_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "park_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      park_features: {
        Row: {
          feature_id: string
          note: string | null
          park_id: string
          quantity: number | null
          source_id: string | null
          status: Database["public"]["Enums"]["feature_status"]
          updated_at: string
          value: string | null
          verified_at: string | null
        }
        Insert: {
          feature_id: string
          note?: string | null
          park_id: string
          quantity?: number | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["feature_status"]
          updated_at?: string
          value?: string | null
          verified_at?: string | null
        }
        Update: {
          feature_id?: string
          note?: string | null
          park_id?: string
          quantity?: number | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["feature_status"]
          updated_at?: string
          value?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "park_features_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_features_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_features_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_features_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "park_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      park_media: {
        Row: {
          caption: string | null
          category: Database["public"]["Enums"]["media_category"]
          created_at: string
          id: string
          is_cover: boolean
          park_id: string
          status: Database["public"]["Enums"]["media_status"]
          url: string
          user_id: string | null
          zone_id: string | null
        }
        Insert: {
          caption?: string | null
          category?: Database["public"]["Enums"]["media_category"]
          created_at?: string
          id?: string
          is_cover?: boolean
          park_id: string
          status?: Database["public"]["Enums"]["media_status"]
          url: string
          user_id?: string | null
          zone_id?: string | null
        }
        Update: {
          caption?: string | null
          category?: Database["public"]["Enums"]["media_category"]
          created_at?: string
          id?: string
          is_cover?: boolean
          park_id?: string
          status?: Database["public"]["Enums"]["media_status"]
          url?: string
          user_id?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "park_media_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_media_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_media_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "park_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      park_names: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          lang: string
          name: string
          park_id: string
          source_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          lang: string
          name: string
          park_id: string
          source_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          lang?: string
          name?: string
          park_id?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "park_names_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_names_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_names_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "park_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      park_opening_hours: {
        Row: {
          created_at: string
          id: string
          note: string | null
          opening_hours: string
          park_id: string
          season_from: string | null
          season_until: string | null
          source_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          opening_hours: string
          park_id: string
          season_from?: string | null
          season_until?: string | null
          source_id?: string | null
          timezone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          opening_hours?: string
          park_id?: string
          season_from?: string | null
          season_until?: string | null
          source_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "park_opening_hours_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_opening_hours_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_opening_hours_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "park_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      park_scores: {
        Row: {
          accessibility_score: number | null
          algorithm_version: string
          calculated_at: string
          cleanliness_score: number | null
          comfort_score: number | null
          confidence_score: number | null
          equipment_score: number | null
          id: string
          overall_score: number | null
          park_id: string
          safety_score: number | null
        }
        Insert: {
          accessibility_score?: number | null
          algorithm_version: string
          calculated_at?: string
          cleanliness_score?: number | null
          comfort_score?: number | null
          confidence_score?: number | null
          equipment_score?: number | null
          id?: string
          overall_score?: number | null
          park_id: string
          safety_score?: number | null
        }
        Update: {
          accessibility_score?: number | null
          algorithm_version?: string
          calculated_at?: string
          cleanliness_score?: number | null
          comfort_score?: number | null
          confidence_score?: number | null
          equipment_score?: number | null
          id?: string
          overall_score?: number | null
          park_id?: string
          safety_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "park_scores_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_scores_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      park_sources: {
        Row: {
          created_at: string
          id: string
          last_synced_at: string | null
          license: string | null
          park_id: string
          source_name: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          source_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_synced_at?: string | null
          license?: string | null
          park_id: string
          source_name?: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          source_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_synced_at?: string | null
          license?: string | null
          park_id?: string
          source_name?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "park_sources_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_sources_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      park_zones: {
        Row: {
          boundary: unknown
          created_at: string
          description: string | null
          id: string
          location: unknown
          max_age: number | null
          min_age: number | null
          name: string
          park_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          boundary?: unknown
          created_at?: string
          description?: string | null
          id?: string
          location?: unknown
          max_age?: number | null
          min_age?: number | null
          name: string
          park_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          boundary?: unknown
          created_at?: string
          description?: string | null
          id?: string
          location?: unknown
          max_age?: number | null
          min_age?: number | null
          name?: string
          park_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "park_zones_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_zones_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      parks: {
        Row: {
          address_line: string | null
          admin_area_1: string | null
          admin_area_2: string | null
          age_max: number
          age_min: number
          ages_derived: boolean
          benches: boolean
          boundary: unknown
          city: string | null
          commune_id: string | null
          country_code: string
          created_at: string
          created_by: string | null
          description: string | null
          fenced: boolean
          formatted_address: string
          geom: unknown
          has_open_report: boolean
          id: string
          last_verified_at: string | null
          lat: number
          latitude: number
          lng: number
          location: unknown
          longitude: number
          max_age: number | null
          min_age: number | null
          moderation_status: Database["public"]["Enums"]["park_moderation_status"]
          name: string
          operational_status: Database["public"]["Enums"]["park_operational_status"]
          parking: boolean
          photos: string[]
          play_equipment: string[]
          pmr: boolean
          postal_code: string | null
          rating: number
          review_count: number
          shade: boolean
          slug: string | null
          status: Database["public"]["Enums"]["park_status"]
          status_from: string | null
          status_reason: string | null
          status_until: string | null
          surface: Database["public"]["Enums"]["park_surface"]
          timezone: string
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
          views: number
          water: boolean
          wc: boolean
        }
        Insert: {
          address_line?: string | null
          admin_area_1?: string | null
          admin_area_2?: string | null
          age_max?: number
          age_min?: number
          ages_derived?: boolean
          benches?: boolean
          boundary?: unknown
          city?: string | null
          commune_id?: string | null
          country_code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          fenced?: boolean
          formatted_address: string
          geom?: unknown
          has_open_report?: boolean
          id?: string
          last_verified_at?: string | null
          lat: number
          latitude: number
          lng: number
          location?: unknown
          longitude: number
          max_age?: number | null
          min_age?: number | null
          moderation_status?: Database["public"]["Enums"]["park_moderation_status"]
          name: string
          operational_status?: Database["public"]["Enums"]["park_operational_status"]
          parking?: boolean
          photos?: string[]
          play_equipment?: string[]
          pmr?: boolean
          postal_code?: string | null
          rating?: number
          review_count?: number
          shade?: boolean
          slug?: string | null
          status?: Database["public"]["Enums"]["park_status"]
          status_from?: string | null
          status_reason?: string | null
          status_until?: string | null
          surface?: Database["public"]["Enums"]["park_surface"]
          timezone: string
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          views?: number
          water?: boolean
          wc?: boolean
        }
        Update: {
          address_line?: string | null
          admin_area_1?: string | null
          admin_area_2?: string | null
          age_max?: number
          age_min?: number
          ages_derived?: boolean
          benches?: boolean
          boundary?: unknown
          city?: string | null
          commune_id?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          fenced?: boolean
          formatted_address?: string
          geom?: unknown
          has_open_report?: boolean
          id?: string
          last_verified_at?: string | null
          lat?: number
          latitude?: number
          lng?: number
          location?: unknown
          longitude?: number
          max_age?: number | null
          min_age?: number | null
          moderation_status?: Database["public"]["Enums"]["park_moderation_status"]
          name?: string
          operational_status?: Database["public"]["Enums"]["park_operational_status"]
          parking?: boolean
          photos?: string[]
          play_equipment?: string[]
          pmr?: boolean
          postal_code?: string | null
          rating?: number
          review_count?: number
          shade?: boolean
          slug?: string | null
          status?: Database["public"]["Enums"]["park_status"]
          status_from?: string | null
          status_reason?: string | null
          status_until?: string | null
          surface?: Database["public"]["Enums"]["park_surface"]
          timezone?: string
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          views?: number
          water?: boolean
          wc?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "parks_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "communes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          children: Json
          created_at: string
          dark_mode: boolean
          email: string
          favorites: string[]
          id: string
          name: string
          notif_channels: Json
          notif_prefs: Json
          offline_mode: boolean
          privacy_prefs: Json
          suspended: boolean
        }
        Insert: {
          children?: Json
          created_at?: string
          dark_mode?: boolean
          email: string
          favorites?: string[]
          id: string
          name: string
          notif_channels?: Json
          notif_prefs?: Json
          offline_mode?: boolean
          privacy_prefs?: Json
          suspended?: boolean
        }
        Update: {
          children?: Json
          created_at?: string
          dark_mode?: boolean
          email?: string
          favorites?: string[]
          id?: string
          name?: string
          notif_channels?: Json
          notif_prefs?: Json
          offline_mode?: boolean
          privacy_prefs?: Json
          suspended?: boolean
        }
        Relationships: []
      }
      reports: {
        Row: {
          category: Database["public"]["Enums"]["report_category"]
          comment: string | null
          created_at: string
          description: string | null
          equipment: string | null
          equipment_id: string | null
          equipment_label: string | null
          id: string
          park_id: string
          photo: string | null
          reason: Database["public"]["Enums"]["report_reason"]
          reported_by_name: string
          resolution_days: number | null
          resolution_note: string | null
          resolution_photo: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["report_severity"]
          status: Database["public"]["Enums"]["report_status"]
          user_id: string | null
          zone_id: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["report_category"]
          comment?: string | null
          created_at?: string
          description?: string | null
          equipment?: string | null
          equipment_id?: string | null
          equipment_label?: string | null
          id?: string
          park_id: string
          photo?: string | null
          reason: Database["public"]["Enums"]["report_reason"]
          reported_by_name: string
          resolution_days?: number | null
          resolution_note?: string | null
          resolution_photo?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["report_severity"]
          status?: Database["public"]["Enums"]["report_status"]
          user_id?: string | null
          zone_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["report_category"]
          comment?: string | null
          created_at?: string
          description?: string | null
          equipment?: string | null
          equipment_id?: string | null
          equipment_label?: string | null
          id?: string
          park_id?: string
          photo?: string | null
          reason?: Database["public"]["Enums"]["report_reason"]
          reported_by_name?: string
          resolution_days?: number | null
          resolution_note?: string | null
          resolution_photo?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["report_severity"]
          status?: Database["public"]["Enums"]["report_status"]
          user_id?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "park_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "park_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          age_band: Database["public"]["Enums"]["age_band"] | null
          author_name: string
          cleanliness: number | null
          comfort: number | null
          comment: string | null
          created_at: string
          equipment: number | null
          flagged: boolean
          id: string
          park_id: string
          photo: string | null
          rating: number
          recommended_max_age: number | null
          recommended_min_age: number | null
          reply: string | null
          reply_at: string | null
          reply_by: string | null
          safety: number | null
          stars: number
          status: Database["public"]["Enums"]["review_status"]
          sub_ratings: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          age_band?: Database["public"]["Enums"]["age_band"] | null
          author_name: string
          cleanliness?: number | null
          comfort?: number | null
          comment?: string | null
          created_at?: string
          equipment?: number | null
          flagged?: boolean
          id?: string
          park_id: string
          photo?: string | null
          rating: number
          recommended_max_age?: number | null
          recommended_min_age?: number | null
          reply?: string | null
          reply_at?: string | null
          reply_by?: string | null
          safety?: number | null
          stars: number
          status?: Database["public"]["Enums"]["review_status"]
          sub_ratings?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          age_band?: Database["public"]["Enums"]["age_band"] | null
          author_name?: string
          cleanliness?: number | null
          comfort?: number | null
          comment?: string | null
          created_at?: string
          equipment?: number | null
          flagged?: boolean
          id?: string
          park_id?: string
          photo?: string | null
          rating?: number
          recommended_max_age?: number | null
          recommended_min_age?: number | null
          reply?: string | null
          reply_at?: string | null
          reply_by?: string | null
          safety?: number | null
          stars?: number
          status?: Database["public"]["Enums"]["review_status"]
          sub_ratings?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "park_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_park_id_fkey"
            columns: ["park_id"]
            isOneToOne: false
            referencedRelation: "parks"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          commune_id: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          name: string
          organization_id: string | null
          role: Database["public"]["Enums"]["team_role"]
          user_id: string | null
        }
        Insert: {
          commune_id?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          name: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["team_role"]
          user_id?: string | null
        }
        Update: {
          commune_id?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          name?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["team_role"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "communes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      park_public: {
        Row: {
          address_line: string | null
          admin_area_1: string | null
          admin_area_2: string | null
          age_max: number | null
          age_min: number | null
          ages_derived: boolean | null
          benches: boolean | null
          boundary: unknown
          city: string | null
          commune_id: string | null
          country_code: string | null
          cover_photo: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          features: Json | null
          fenced: boolean | null
          formatted_address: string | null
          has_open_report: boolean | null
          has_score: boolean | null
          id: string | null
          last_verified_at: string | null
          lat: number | null
          latitude: number | null
          lng: number | null
          location: unknown
          longitude: number | null
          max_age: number | null
          min_age: number | null
          moderation_status:
            | Database["public"]["Enums"]["park_moderation_status"]
            | null
          name: string | null
          operational_status:
            | Database["public"]["Enums"]["park_operational_status"]
            | null
          organization_id: string | null
          parking: boolean | null
          photos: string[] | null
          play_equipment: string[] | null
          pmr: boolean | null
          postal_code: string | null
          rating: number | null
          review_count: number | null
          score: number | null
          shade: boolean | null
          slug: string | null
          status: Database["public"]["Enums"]["park_moderation_status"] | null
          status_from: string | null
          status_reason: string | null
          status_until: string | null
          surface: string | null
          timezone: string | null
          translated_names: string[] | null
          updated_at: string | null
          verification_status:
            | Database["public"]["Enums"]["verification_status"]
            | null
          views: number | null
          water: boolean | null
          wc: boolean | null
        }
        Insert: {
          address_line?: string | null
          admin_area_1?: string | null
          admin_area_2?: string | null
          age_max?: number | null
          age_min?: number | null
          ages_derived?: boolean | null
          benches?: never
          boundary?: unknown
          city?: string | null
          commune_id?: never
          country_code?: string | null
          cover_photo?: never
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          features?: never
          fenced?: never
          formatted_address?: never
          has_open_report?: boolean | null
          has_score?: never
          id?: string | null
          last_verified_at?: string | null
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          location?: unknown
          longitude?: number | null
          max_age?: number | null
          min_age?: number | null
          moderation_status?:
            | Database["public"]["Enums"]["park_moderation_status"]
            | null
          name?: string | null
          operational_status?:
            | Database["public"]["Enums"]["park_operational_status"]
            | null
          organization_id?: never
          parking?: never
          photos?: never
          play_equipment?: never
          pmr?: never
          postal_code?: string | null
          rating?: number | null
          review_count?: number | null
          score?: never
          shade?: never
          slug?: string | null
          status?: Database["public"]["Enums"]["park_moderation_status"] | null
          status_from?: string | null
          status_reason?: string | null
          status_until?: string | null
          surface?: never
          timezone?: string | null
          translated_names?: never
          updated_at?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          views?: number | null
          water?: never
          wc?: never
        }
        Update: {
          address_line?: string | null
          admin_area_1?: string | null
          admin_area_2?: string | null
          age_max?: number | null
          age_min?: number | null
          ages_derived?: boolean | null
          benches?: never
          boundary?: unknown
          city?: string | null
          commune_id?: never
          country_code?: string | null
          cover_photo?: never
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          features?: never
          fenced?: never
          formatted_address?: never
          has_open_report?: boolean | null
          has_score?: never
          id?: string | null
          last_verified_at?: string | null
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          location?: unknown
          longitude?: number | null
          max_age?: number | null
          min_age?: number | null
          moderation_status?:
            | Database["public"]["Enums"]["park_moderation_status"]
            | null
          name?: string | null
          operational_status?:
            | Database["public"]["Enums"]["park_operational_status"]
            | null
          organization_id?: never
          parking?: never
          photos?: never
          play_equipment?: never
          pmr?: never
          postal_code?: string | null
          rating?: number | null
          review_count?: number | null
          score?: never
          shade?: never
          slug?: string | null
          status?: Database["public"]["Enums"]["park_moderation_status"] | null
          status_from?: string | null
          status_reason?: string | null
          status_until?: string | null
          surface?: never
          timezone?: string | null
          translated_names?: never
          updated_at?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          views?: number | null
          water?: never
          wc?: never
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      can_edit_park: {
        Args: { p_park_id: string; p_uid: string }
        Returns: boolean
      }
      commune_role: {
        Args: { p_commune_id: string; p_uid: string }
        Returns: Database["public"]["Enums"]["team_role"]
      }
      delete_own_account: { Args: never; Returns: undefined }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      find_duplicate_parks: {
        Args: {
          p_exclude?: string
          p_lat: number
          p_lng: number
          p_name: string
          p_radius_m?: number
        }
        Returns: {
          distance_m: number
          name: string
          name_similarity: number
          park_id: string
          score: number
        }[]
      }
      fstatus: { Args: { p_code: string; p_park_id: string }; Returns: string }
      fvalue: { Args: { p_code: string; p_park_id: string }; Returns: string }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      gettransactionid: { Args: never; Returns: unknown }
      increment_park_views: { Args: { p_park_id: string }; Returns: undefined }
      is_commune_gestionnaire: {
        Args: { p_commune_id: string; p_uid: string }
        Returns: boolean
      }
      is_commune_member: {
        Args: { p_commune_id: string; p_uid: string }
        Returns: boolean
      }
      is_org_gestionnaire: {
        Args: { p_org_id: string; p_uid: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { p_org_id: string; p_uid: string }
        Returns: boolean
      }
      is_toboggo_admin: { Args: { p_uid: string }; Returns: boolean }
      is_toboggo_staff: { Args: { p_uid: string }; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      manages_park: {
        Args: { p_park_id: string; p_uid: string }
        Returns: boolean
      }
      nearby_parks: {
        Args: { p_lat: number; p_lng: number; p_radius_m?: number }
        Returns: {
          address_line: string
          age_max: number
          age_min: number
          benches: boolean
          city: string
          commune_id: string
          country_code: string
          cover_photo: string
          created_at: string
          created_by: string
          description: string
          distance_m: number
          features: Json
          fenced: boolean
          formatted_address: string
          has_open_report: boolean
          id: string
          lat: number
          latitude: number
          lng: number
          longitude: number
          max_age: number
          min_age: number
          moderation_status: Database["public"]["Enums"]["park_moderation_status"]
          name: string
          operational_status: Database["public"]["Enums"]["park_operational_status"]
          organization_id: string
          parking: boolean
          photos: string[]
          play_equipment: string[]
          pmr: boolean
          rating: number
          review_count: number
          score: number
          shade: boolean
          status: Database["public"]["Enums"]["park_moderation_status"]
          surface: string
          timezone: string
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
          views: number
          water: boolean
          wc: boolean
        }[]
      }
      org_role: {
        Args: { p_org_id: string; p_uid: string }
        Returns: Database["public"]["Enums"]["team_role"]
      }
      park_is_visible: { Args: { p_park_id: string }; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      recalculate_park_score: { Args: { p_park_id: string }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      access_level: "yes" | "limited" | "no" | "unknown"
      age_band: "all" | "under3" | "3-6" | "6-12"
      edit_status: "pending" | "approved" | "rejected" | "auto_approved"
      entrance_type: "main" | "secondary" | "pmr" | "parking" | "service"
      equipment_condition:
        | "new"
        | "good"
        | "fair"
        | "poor"
        | "out_of_service"
        | "unknown"
      equipment_status: "installed" | "removed" | "planned" | "unknown"
      feature_category:
        | "play"
        | "service"
        | "environment"
        | "accessibility"
        | "safety"
      feature_status:
        | "available"
        | "unavailable"
        | "unknown"
        | "temporarily_unavailable"
      maintenance_recur: "none" | "monthly" | "yearly"
      media_category:
        | "cover"
        | "play_area"
        | "entrance"
        | "equipment"
        | "surroundings"
        | "accessibility"
        | "other"
      media_status: "pending" | "approved" | "rejected"
      notification_type:
        | "resolved"
        | "newPark"
        | "thanks"
        | "confirm"
        | "recommend"
      organization_park_role:
        | "owner"
        | "manager"
        | "operator"
        | "maintainer"
        | "contributor"
      organization_type:
        | "municipality"
        | "intercommunality"
        | "department"
        | "region"
        | "state"
        | "private_operator"
        | "association"
        | "other"
      park_moderation_status:
        | "draft"
        | "pending"
        | "published"
        | "blocked"
        | "rejected"
      park_operational_status:
        | "active"
        | "temporarily_closed"
        | "partially_closed"
        | "under_construction"
        | "permanently_closed"
        | "unknown"
      park_status: "draft" | "pending" | "published" | "blocked" | "rejected"
      park_surface: "sable" | "gazon" | "sol_souple" | "non_precise"
      report_category:
        | "broken_equipment"
        | "safety"
        | "cleanliness"
        | "vegetation"
        | "accessibility"
        | "wrong_info"
        | "other"
      report_reason:
        | "broken_equipment"
        | "safety"
        | "cleanliness"
        | "vegetation"
        | "accessibility"
        | "wrong_info"
        | "other"
      report_severity: "low" | "medium" | "high" | "critical"
      report_status: "open" | "in_progress" | "resolved" | "dismissed"
      review_status: "published" | "flagged" | "hidden" | "pending"
      source_type:
        | "osm"
        | "open_data"
        | "municipality"
        | "partner"
        | "user"
        | "toboggo"
        | "other"
      team_role:
        | "super_admin"
        | "moderation"
        | "support"
        | "gestionnaire"
        | "contributeur"
      verification_status:
        | "unverified"
        | "community_verified"
        | "organization_verified"
        | "toboggo_verified"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      access_level: ["yes", "limited", "no", "unknown"],
      age_band: ["all", "under3", "3-6", "6-12"],
      edit_status: ["pending", "approved", "rejected", "auto_approved"],
      entrance_type: ["main", "secondary", "pmr", "parking", "service"],
      equipment_condition: [
        "new",
        "good",
        "fair",
        "poor",
        "out_of_service",
        "unknown",
      ],
      equipment_status: ["installed", "removed", "planned", "unknown"],
      feature_category: [
        "play",
        "service",
        "environment",
        "accessibility",
        "safety",
      ],
      feature_status: [
        "available",
        "unavailable",
        "unknown",
        "temporarily_unavailable",
      ],
      maintenance_recur: ["none", "monthly", "yearly"],
      media_category: [
        "cover",
        "play_area",
        "entrance",
        "equipment",
        "surroundings",
        "accessibility",
        "other",
      ],
      media_status: ["pending", "approved", "rejected"],
      notification_type: [
        "resolved",
        "newPark",
        "thanks",
        "confirm",
        "recommend",
      ],
      organization_park_role: [
        "owner",
        "manager",
        "operator",
        "maintainer",
        "contributor",
      ],
      organization_type: [
        "municipality",
        "intercommunality",
        "department",
        "region",
        "state",
        "private_operator",
        "association",
        "other",
      ],
      park_moderation_status: [
        "draft",
        "pending",
        "published",
        "blocked",
        "rejected",
      ],
      park_operational_status: [
        "active",
        "temporarily_closed",
        "partially_closed",
        "under_construction",
        "permanently_closed",
        "unknown",
      ],
      park_status: ["draft", "pending", "published", "blocked", "rejected"],
      park_surface: ["sable", "gazon", "sol_souple", "non_precise"],
      report_category: [
        "broken_equipment",
        "safety",
        "cleanliness",
        "vegetation",
        "accessibility",
        "wrong_info",
        "other",
      ],
      report_reason: [
        "broken_equipment",
        "safety",
        "cleanliness",
        "vegetation",
        "accessibility",
        "wrong_info",
        "other",
      ],
      report_severity: ["low", "medium", "high", "critical"],
      report_status: ["open", "in_progress", "resolved", "dismissed"],
      review_status: ["published", "flagged", "hidden", "pending"],
      source_type: [
        "osm",
        "open_data",
        "municipality",
        "partner",
        "user",
        "toboggo",
        "other",
      ],
      team_role: [
        "super_admin",
        "moderation",
        "support",
        "gestionnaire",
        "contributeur",
      ],
      verification_status: [
        "unverified",
        "community_verified",
        "organization_verified",
        "toboggo_verified",
      ],
    },
  },
} as const

