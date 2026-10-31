import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArtistArea } from './artist-area';

describe('ArtistArea', () => {
  let component: ArtistArea;
  let fixture: ComponentFixture<ArtistArea>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArtistArea],
    }).compileComponents();

    fixture = TestBed.createComponent(ArtistArea);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
